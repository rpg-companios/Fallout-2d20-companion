/**
 * AlertHost — единственное место, где диалоги реально рисуются.
 *
 * Монтируется один раз в App.js рядом с FusionCoreChoiceModal. Обычная
 * React-модалка, поэтому на вебе и на нативе диалог выглядит и ведёт себя
 * одинаково, а число кнопок ничем не ограничено — в отличие от
 * window.confirm (ровно две) и window.prompt (ввод текста руками).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { registerAlertHost } from './alertService';
import { DEFAULT_CONFIRM_BUTTONS } from './catalog';
import { useLocale } from '../../i18n/locale';
import { tApp } from '../../i18n/appI18n';
import { tInventory } from '../screens/InventoryScreen/logic/inventoryI18n';
import { tCharacterScreen } from '../../modules/fallout/screens/CharacterScreen/logic/characterScreenI18n';
import tHomeScreenDict from '../../i18n/ru-RU/screens/home/screen.json';
import tHomeScreenDictEn from '../../i18n/en-EN/screens/home/screen.json';
import { getCurrentLocale } from '../../i18n/locale';

const HOME_DICTS = { 'ru-RU': tHomeScreenDict, 'en-EN': tHomeScreenDictEn };

const readPath = (dict, path) => {
  let current = dict;
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) return undefined;
  }
  return current;
};

/**
 * Перевод по scope записи каталога. Каждый экран приложения держит свой
 * словарь, поэтому единой t-функции нет — выбираем по scope.
 */
const translate = (scope, path) => {
  if (path === undefined || path === null) return '';
  if (scope === 'home') {
    return readPath(HOME_DICTS[getCurrentLocale()], path) ?? path;
  }
  if (scope === 'inventory') return tInventory(path);
  if (scope === 'character') return tCharacterScreen(path);
  if (scope === 'app') return tApp(path);
  return path;
};

const substitute = (text, params) => {
  if (!text || !params) return text || '';
  return String(text).replace(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
};

const AlertHost = () => {
  useLocale();
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  useEffect(() => {
    const unregister = registerAlertHost((nextRequest) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setRequest(nextRequest);
      }),
    );
    return unregister;
  }, []);

  const finish = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    if (resolve) resolve(result);
  }, []);

  if (!request) return null;

  const { entry, params, raw } = request;
  const scope = entry.scope;

  const title = raw ? raw.title : substitute(translate(scope, entry.titleKey), params);
  const message = raw ? raw.message : substitute(translate(scope, entry.messageKey), params);

  // Состав кнопок зависит от вида диалога.
  let buttons;
  if (entry.kind === 'choice') {
    buttons = (entry.buttons || []).map((button) => ({
      key: button.key,
      // labelParam — подпись целиком приходит из params (например, названия
      // сторон «Левый наруч» / «Правый понож», которые зависят от предмета).
      // labelKey — обычный путь в словаре.
      label: button.labelParam
        ? String(params?.[button.labelParam] ?? button.labelParam)
        : substitute(translate(scope, button.labelKey), params),
      value: button.value,
      style: button.style,
    }));
  } else if (entry.kind === 'confirm') {
    buttons = [
      {
        key: 'confirm',
        label: translate(scope, entry.confirmKey || DEFAULT_CONFIRM_BUTTONS.confirmKey),
        value: true,
        style: entry.destructive ? 'destructive' : undefined,
      },
      {
        key: 'cancel',
        label: translate(scope, entry.cancelKey || DEFAULT_CONFIRM_BUTTONS.cancelKey),
        value: false,
        style: 'cancel',
      },
    ];
  } else {
    buttons = [{ key: 'ok', label: translate(scope, entry.okKey || 'buttons.ok'), value: undefined }];
  }

  const cancelValue = entry.kind === 'confirm' ? false : null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => finish(cancelValue)}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {!!title && <Text style={styles.title}>{title}</Text>}
          {!!message && (
            <ScrollView style={styles.messageScroll} contentContainerStyle={styles.messageWrap}>
              <Text style={styles.message}>{message}</Text>
            </ScrollView>
          )}
          <View style={styles.buttons}>
            {buttons.map((button) => (
              <TouchableOpacity
                key={button.key}
                style={[
                  styles.button,
                  button.style === 'destructive' && styles.buttonDestructive,
                  button.style === 'cancel' && styles.buttonCancel,
                ]}
                onPress={() => finish(button.value)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.buttonTextCancel,
                  ]}
                >
                  {button.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#1f1f1f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f0e68c',
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f0e68c',
    marginBottom: 12,
    textAlign: 'center',
  },
  messageScroll: { maxHeight: 260 },
  messageWrap: { paddingBottom: 4 },
  message: { fontSize: 15, color: '#e8e8e8', lineHeight: 21, textAlign: 'center' },
  buttons: { marginTop: 18, gap: 8 },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3a3a1e',
    borderWidth: 1,
    borderColor: '#f0e68c',
    alignItems: 'center',
  },
  buttonDestructive: { backgroundColor: '#4a1f1f', borderColor: '#e57373' },
  buttonCancel: { backgroundColor: 'transparent', borderColor: '#777' },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#f0e68c' },
  buttonTextCancel: { color: '#bbb' },
});

export default AlertHost;
