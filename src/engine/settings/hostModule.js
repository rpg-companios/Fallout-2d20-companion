// src/engine/settings/hostModule.js
// Значения host-мапы для пакетов, которые пакет сеттинга грузит через require().

/**
 * Возвращает CommonJS-модуль для пакета, собранного без ES-обёртки.
 *
 * Пакет сеттинга — обычный CommonJS, и каждый require() он оборачивает в
 * esbuild-овский __toESM, который копирует собственные свойства модуля.
 * `import * as` отдаёт наружу не сам модуль, а обёртку Babel/Metro
 * (_interopRequireWildcard): у пакетов без `__esModule` она собирается вручную
 * (`{ ...exports, default: exports }`), и на Hermes копия теряла `useMemo` —
 * падение «Object is not a function» в CharacterScreen (setting.cjs:65459).
 *
 * Модуль с `__esModule` (ES-сборка, например @expo/vector-icons или
 * react-native-web) уже отдаётся как есть — его и возвращаем.
 */
export const commonJsHostModule = (namespace) => {
  if (!namespace || typeof namespace !== 'object') return namespace;
  if (namespace.__esModule) return namespace;
  const defaultExport = namespace.default;
  const isModule = defaultExport
    && (typeof defaultExport === 'object' || typeof defaultExport === 'function');
  return isModule ? defaultExport : namespace;
};
