// Патч 549: единый механизм перетаскивания для всего приложения.
//
// ЗАЧЕМ. До 549 жест был скопирован в четырёх местах: карточки персонажей
// (HomeScreen), карточки ключей (KeyItemCardCell), карточки сетки Мастера
// (ContainerCardCell) и строки дерева локаций (HubTreeView). Три копии жили
// по одному рабочему шаблону, четвёртая изобрела свой — и сломалась (патч 548:
// контекст строки задавался в bubble-фазе, а решение принималось в capture,
// поэтому ручка была мертва всегда). Копии расходятся молча: правка в одной
// не доходит до остальных. Здесь один механизм на все экраны.
//
// ЗАКОН ФАЗЫ ОПРОСА. Система ответственности RN опрашивает capture сверху
// вниз и принимает решение СРАЗУ, как только обработчик вернул true; bubble
// после этого не зовётся (`findWantsResponder` в react-native-web,
// `ResponderEventPlugin` в RN). Поэтому всё, что нужно жесту, задаётся в
// capture, а полезные данные читаются из ref в момент выдачи жеста, а не из
// bubble-обработчика. Проверено по коду:
//   react-native-web/dist/modules/useResponderEvents/ResponderSystem.js
//   react-native-web/dist/vendor/react-native/PanResponder/index.js
//
// КОНТРАКТ. onStart/onMove/onEnd получают точку {pageX, pageY} и полезную
// нагрузку строки/карточки. onEnd дополнительно получает {cancelled, moved}:
// перенос засчитывается только при настоящем движении, простое нажатие
// безвредно (урок 548).
import { useCallback, useRef } from 'react';
import { PanResponder } from 'react-native';

// Признак «нагрузка берётся из текущих пропсов», а не из привязки строки.
const CURRENT_PAYLOAD = Symbol('useDragResponder.currentPayload');

const pointOf = (x, y) => ({ pageX: Number(x) || 0, pageY: Number(y) || 0 });

/**
 * @param {object}   options
 * @param {*}        options.payload  нагрузка карточки (контейнер, персонаж…)
 * @param {Function} options.onStart  (point, payload) => void
 * @param {Function} options.onMove   (point, payload) => void
 * @param {Function} options.onEnd    (point, payload, meta) => void
 * @param {boolean}  options.enabled  можно ли вообще брать жест
 * @returns {{panHandlers: object, handlersFor: Function, draggingRef: object}}
 *   `panHandlers` — для одной карточки; `handlersFor(payload)` — для списка
 *   строк, где у каждой своя нагрузка (дерево локаций).
 */
export default function useDragResponder({
  payload,
  onStart,
  onMove,
  onEnd,
  enabled = true,
} = {}) {
  // Пропсы читаются через ref: обработчики PanResponder создаются один раз,
  // но всегда видят свежие колбэки и свежую нагрузку.
  const callbacksRef = useRef({});
  callbacksRef.current = { payload, onStart, onMove, onEnd, enabled };

  // Нагрузка, заявленная на этапе опроса фаз (для списка строк).
  const claimedRef = useRef(CURRENT_PAYLOAD);
  // Состояние текущего жеста.
  const activeRef = useRef(null);
  const lastPointRef = useRef(pointOf(0, 0));
  // Гасит синтетический onPress, который приходит сразу после отпускания.
  const draggingRef = useRef(false);

  const claim = useCallback((claimed) => {
    if (!callbacksRef.current.enabled) return false;
    claimedRef.current = claimed;
    return true;
  }, []);

  const finish = useCallback((cancelled) => {
    const active = activeRef.current;
    activeRef.current = null;
    claimedRef.current = CURRENT_PAYLOAD;
    // Отпускание без движения — не перенос (канон 548).
    const meta = { cancelled: Boolean(cancelled), moved: Boolean(active?.moved) };
    if (active) callbacksRef.current.onEnd?.(lastPointRef.current, active.payload, meta);
    // Пресс после отпускания должен быть проглочен.
    setTimeout(() => { draggingRef.current = false; }, 0);
  }, []);

  const responder = useRef(PanResponder.create({
    // Захват заявляется в ОБЕИХ фазах: capture — живой путь, bubble — запасной.
    onStartShouldSetPanResponderCapture: () => claim(CURRENT_PAYLOAD),
    onMoveShouldSetPanResponderCapture: () => claim(CURRENT_PAYLOAD),
    onStartShouldSetPanResponder: () => claim(CURRENT_PAYLOAD),
    onMoveShouldSetPanResponder: () => claim(CURRENT_PAYLOAD),
    // Жест не отдаём ScrollView: иначе первое вертикальное движение обрывает
    // перенос, ручка тут же перехватывает палец обратно и карточка дрожит.
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (_event, gesture) => {
      const current = callbacksRef.current;
      if (!current.enabled) return;
      const claimed = claimedRef.current;
      const resolved = claimed === CURRENT_PAYLOAD ? current.payload : claimed;
      lastPointRef.current = pointOf(gesture?.x0, gesture?.y0);
      activeRef.current = { payload: resolved, moved: false };
      draggingRef.current = true;
      current.onStart?.(lastPointRef.current, resolved);
    },
    onPanResponderMove: (_event, gesture) => {
      const active = activeRef.current;
      if (!active) return;
      // RN на вебе присылает нулевую точку, когда движения в цикле не было.
      if (!gesture || (gesture.moveX === 0 && gesture.moveY === 0)) return;
      active.moved = true;
      lastPointRef.current = pointOf(gesture.moveX, gesture.moveY);
      callbacksRef.current.onMove?.(lastPointRef.current, active.payload);
    },
    onPanResponderRelease: () => finish(false),
    onPanResponderTerminate: () => finish(true),
    onPanResponderReject: () => {
      activeRef.current = null;
      claimedRef.current = CURRENT_PAYLOAD;
      draggingRef.current = false;
    },
  })).current;

  /**
   * Патч 563: ЗАКОН ИМЁН. У `View` нет пропсов `onStartShouldSetPanResponder*` —
   * это имена КОНФИГА `PanResponder.create`. Пропсы системы ответственности
   * называются `onStartShouldSetResponder*`, и именно их опрашивает RN
   * (`node_modules/react-native-web/dist/vendor/react-native/PanResponder/index.js`:
   * `panHandlers.onStartShouldSetResponderCapture` зовёт
   * `config.onStartShouldSetPanResponderCapture`).
   *
   * До 563 хук подмешивал в `panHandlers` «пан-имена»: RN их не читает, значит
   * нагрузка строки не заявлялась ВООБЩЕ, `onStart` получал `undefined`, и драг
   * в дереве локации был мёртв всегда (548 «починили» его тем же способом).
   *
   * Здесь обработчики строятся по настоящим именам. Каждый сначала зовёт
   * исходный обработчик PanResponder (он ведёт внутреннее состояние жеста:
   * x0/y0, moveX/moveY), и только потом заявляет нагрузку строки.
   */
  const withRowPayload = useCallback((rowPayload) => {
    const wrap = (original) => (event) => {
      if (typeof original === 'function') original(event);
      return claim(rowPayload);
    };
    return {
      ...responder.panHandlers,
      onStartShouldSetResponderCapture: wrap(responder.panHandlers.onStartShouldSetResponderCapture),
      onStartShouldSetResponder: wrap(responder.panHandlers.onStartShouldSetResponder),
      onMoveShouldSetResponderCapture: wrap(responder.panHandlers.onMoveShouldSetResponderCapture),
      onMoveShouldSetResponder: wrap(responder.panHandlers.onMoveShouldSetResponder),
    };
  }, [claim, responder]);

  // Базовые обработчики одной карточки: нагрузка задана на уровне хука.
  const panHandlersRef = useRef(null);
  if (!panHandlersRef.current) panHandlersRef.current = withRowPayload(CURRENT_PAYLOAD);
  const panHandlers = panHandlersRef.current;

  /**
   * Обработчики для строки списка со СВОЕЙ нагрузкой. Нагрузка заявляется в
   * capture-фазе — именно она принимает решение в живом браузере.
   */
  const handlersFor = useCallback((rowPayload) => withRowPayload(rowPayload), [withRowPayload]);

  return { panHandlers, handlersFor, draggingRef };
}
