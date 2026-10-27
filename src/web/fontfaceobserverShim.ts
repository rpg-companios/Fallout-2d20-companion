// Безопасная веб-замена пакета fontfaceobserver для expo-font (патч 452).
//
// Почему нужна:
// 1. В expo-font (SDK 54, FontLoader.web.js, issue #22954) синхронный
//    try { return ExpoFontLoader.loadAsync(...) } catch {} не перехватывает
//    асинхронный reject промиса от fontfaceobserver.
// 2. Оригинальный fontfaceobserver@2.3.0 при долгой отдаче .ttf через прокси
//    (например, MaterialCommunityIcons.ttf 1.3 МБ в dev-режиме Replit) или при
//    защите от фингерпринтинга (блокировка замеров offsetWidth) выбрасывает
//    необработанный Error("<N>ms timeout exceeded"), роняя приложение на старте,
//    хотя правило @font-face к этому моменту УЖЕ вставлено в <head> и браузер
//    сам дорисует глифы по мере докачки шрифта.

export interface FontFaceObserverDescriptors {
  style?: string;
  weight?: string | number;
  stretch?: string;
  display?: string;
}

const MAX_WAIT_MS = 3000;

export class FontFaceObserver {
  readonly family: string;
  readonly style: string;
  readonly weight: string;
  readonly stretch: string;

  constructor(family: string, descriptors: FontFaceObserverDescriptors = {}) {
    this.family = family;
    this.style = descriptors.style || 'normal';
    this.weight = descriptors.weight != null ? String(descriptors.weight) : 'normal';
    this.stretch = descriptors.stretch || 'normal';
  }

  load(testString?: string | null, timeoutMs?: number): Promise<FontFaceObserver> {
    if (typeof document === 'undefined' || typeof document.fonts?.load !== 'function') {
      return Promise.resolve(this);
    }

    const effectiveTimeout =
      typeof timeoutMs === 'number' && timeoutMs > 0
        ? Math.min(timeoutMs, MAX_WAIT_MS)
        : MAX_WAIT_MS;

    const fontSpec = `${this.style} ${this.weight} 16px ${JSON.stringify(this.family)}`;
    const sample = testString || 'BESbswy';

    return new Promise<FontFaceObserver>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this);
      };

      const timer = setTimeout(finish, effectiveTimeout);

      try {
        document.fonts
          .load(fontSpec, sample)
          .then(finish, finish);
      } catch {
        finish();
      }
    });
  }
}

export default FontFaceObserver;
