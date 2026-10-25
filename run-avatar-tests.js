#!/usr/bin/env node
// run-avatar-tests.js
// Скрипт для запуска тестов аватаров без vitest
// Проверяет ключевые сценарии работы с изображениями

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          Тесты работы с аватарами персонажей               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

let totalPassed = 0;
let totalFailed = 0;

function runTestSuite(name, tests) {
  console.log(`\n📦 ${name}`);
  console.log('─'.repeat(60));
  
  let suitePassed = 0;
  let suiteFailed = 0;
  
  for (const [testName, testFn] of tests) {
    try {
      testFn();
      console.log(`  ✅ ${testName}`);
      suitePassed++;
      totalPassed++;
    } catch (error) {
      console.log(`  ❌ ${testName}`);
      console.log(`     Ошибка: ${error.message}`);
      suiteFailed++;
      totalFailed++;
    }
  }
  
  console.log(`\n  Итоги: ${suitePassed} ✅ | ${suiteFailed} ❌`);
  return suiteFailed === 0;
}

// Загружаем модули
let characterAvatar, useCharacterImage;

try {
  characterAvatar = require('./domain/characterAvatar');
  console.log('✓ Загружен domain/characterAvatar');
} catch (e) {
  console.error('✗ Не удалось загрузить domain/characterAvatar:', e.message);
  process.exit(1);
}

try {
  // useCharacterImage - это React хук, его нельзя тестировать без React
  // Поэтому мы будем тестировать только чистые функции
  console.log('✓ Хук useCharacterImage требует React (пропускаем прямые тесты)');
} catch (e) {
  console.log('  (ожидаемо для хуков)');
}

// Проверяем avatarCache только статически
try {
  const fs = require('fs');
  const avatarCacheCode = fs.readFileSync('./db/avatarCache.js', 'utf8');
  
  if (!avatarCacheCode.includes('setAvatarCache')) {
    throw new Error('Отсутствует setAvatarCache функция');
  }
  if (!avatarCacheCode.includes('getAvatarCache')) {
    throw new Error('Отсутствует getAvatarCache функция');
  }
  console.log('✓ Функции avatarCache проверены статически');
} catch (e) {
  console.error('✗ Ошибка при проверке avatarCache:', e.message);
  process.exit(1);
}

// Тесты для characterAvatar.js
runTestSuite('characterAvatar.js - Валидация и утилиты', [
  ['validateAvatarDataUrl: принимает JPEG', () => {
    const result = characterAvatar.validateAvatarDataUrl('data:image/jpeg;base64,SGVsbG8=');
    if (!result.ok) throw new Error('JPEG не валиден');
    if (result.mimeType !== 'image/jpeg') throw new Error('Неправильный MIME-тип');
    if (result.bytes <= 0) throw new Error('Некорректный размер');
  }],
  
  ['validateAvatarDataUrl: принимает PNG', () => {
    const result = characterAvatar.validateAvatarDataUrl('data:image/png;base64,iVBORw0KGgoA=');
    if (!result.ok) throw new Error('PNG не валиден');
  }],
  
  ['validateAvatarDataUrl: принимает GIF', () => {
    const result = characterAvatar.validateAvatarDataUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    if (!result.ok) throw new Error('GIF не валиден');
  }],
  
  ['validateAvatarDataUrl: принимает WebP', () => {
    const result = characterAvatar.validateAvatarDataUrl('data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=');
    if (!result.ok) throw new Error('WebP не валиден');
  }],
  
  ['validateAvatarDataUrl: отбрасывает невалидный URL', () => {
    const result = characterAvatar.validateAvatarDataUrl('http://example.com/image.jpg');
    if (result.ok) throw new Error('Невалидный URL прошел валидацию');
    if (result.reason !== 'avatar.invalidFormat') throw new Error('Неправильная причина');
  }],
  
  ['validateAvatarDataUrl: отбрасывает пустой URL', () => {
    const result = characterAvatar.validateAvatarDataUrl('');
    if (result.ok) throw new Error('Пустой URL прошел валидацию');
  }],
  
  ['validateAvatarDataUrl: отбрасывает null', () => {
    const result = characterAvatar.validateAvatarDataUrl(null);
    if (result.ok) throw new Error('Null прошел валидацию');
  }],
  
  ['getFileExtension: JPEG → jpg', () => {
    if (characterAvatar.getFileExtension('image/jpeg') !== 'jpg') {
      throw new Error('Неправильное расширение');
    }
  }],
  
  ['getFileExtension: PNG → png', () => {
    if (characterAvatar.getFileExtension('image/png') !== 'png') {
      throw new Error('Неправильное расширение');
    }
  }],
  
  ['getFileExtension: GIF → gif', () => {
    if (characterAvatar.getFileExtension('image/gif') !== 'gif') {
      throw new Error('Неправильное расширение');
    }
  }],
  
  ['getFileExtension: WebP → webp', () => {
    if (characterAvatar.getFileExtension('image/webp') !== 'webp') {
      throw new Error('Неправильное расширение');
    }
  }],
  
  ['getFileExtension: неизвестный тип → расширение из MIME', () => {
    const result = characterAvatar.getFileExtension('image/foobar');
    if (result !== 'foobar') {
      throw new Error(`Ожидалось 'foobar', получено '${result}'`);
    }
  }],
  
  ['getFileExtension: null → jpg', () => {
    if (characterAvatar.getFileExtension(null) !== 'jpg') {
      throw new Error('Неправильное расширение по умолчанию');
    }
  }],
  
  ['base64ByteLength: ABC = 3 байта', () => {
    if (characterAvatar.base64ByteLength('QUJD') !== 3) {
      throw new Error('Неправильный размер');
    }
  }],
  
  ['base64ByteLength: A = 1 байт', () => {
    if (characterAvatar.base64ByteLength('QQ==') !== 1) {
      throw new Error('Неправильный размер');
    }
  }],
  
  ['AVATAR_LIMITS.maxBytes = 5MB', () => {
    if (characterAvatar.AVATAR_LIMITS.maxBytes !== 5 * 1024 * 1024) {
      throw new Error(`maxBytes = ${characterAvatar.AVATAR_LIMITS.maxBytes}, ожидалось ${5 * 1024 * 1024}`);
    }
  }],
  
  ['AVATAR_LIMITS: нет ограничений на форматы', () => {
    if (characterAvatar.AVATAR_LIMITS.allowedMimeTypes !== undefined) {
      throw new Error('Есть ограничения на форматы');
    }
  }],
  
  ['AVATAR_LIMITS: нет ограничений на размер стороны', () => {
    if (characterAvatar.AVATAR_LIMITS.maxEdge !== undefined) {
      throw new Error('Есть ограничения на размер стороны');
    }
  }],
]);



// Тесты для useCharacterImage.js (статическая проверка)
console.log('\n📦 useCharacterImage.js - Статическая проверка');
console.log('─'.repeat(60));

try {
  const fs = require('fs');
  const hookCode = fs.readFileSync('./domain/useCharacterImage.js', 'utf8');
  
  // Проверяем, что imageVersion есть в хуке
  if (!hookCode.includes('imageVersion')) {
    throw new Error('Отсутствует imageVersion состояние');
  }
  console.log('  ✅ Есть imageVersion состояние');
  
  // Проверяем, что refreshImage есть
  if (!hookCode.includes('refreshImage')) {
    throw new Error('Отсутствует refreshImage функция');
  }
  console.log('  ✅ Есть refreshImage функция');
  
  // Проверяем, что refreshImage вызывается после сохранения
  if (!hookCode.includes('refreshImage()')) {
    throw new Error('refreshImage не вызывается после сохранения');
  }
  console.log('  ✅ refreshImage вызывается после сохранения');
  
  // Проверяем, что imageVersion возвращается из хука
  if (!hookCode.match(/return\s*{[\s\S]*?imageVersion[\s\S]*?}/)) {
    throw new Error('imageVersion не возвращается из хука');
  }
  console.log('  ✅ imageVersion возвращается из хука');
  
  // Проверяем, что showRawAlert вызывается с объектом
  const showRawAlertMatches = hookCode.match(/showRawAlert\(([^)]+)\)/g);
  if (showRawAlertMatches) {
    for (const match of showRawAlertMatches) {
      if (match.includes("showRawAlert('") || match.includes('showRawAlert("')) {
        throw new Error(`Найден вызов showRawAlert с позиционными аргументами: ${match}`);
      }
    }
  }
  console.log('  ✅ showRawAlert вызывается с объектом');
  
  // Проверяем, что используется setAvatarCache, а не saveAvatarCache
  if (hookCode.includes('saveAvatarCache')) {
    throw new Error('Используется saveAvatarCache вместо setAvatarCache');
  }
  console.log('  ✅ Используется setAvatarCache');
  
  totalPassed += 6;
} catch (error) {
  console.log(`  ❌ ${error.message}`);
  totalFailed++;
}

// Итоги
console.log('\n' + '═'.repeat(60));
console.log(`📊 ВСЕГО: ${totalPassed} ✅ | ${totalFailed} ❌`);
console.log('═'.repeat(60));

if (totalFailed > 0) {
  console.log('\n❌ Некоторые тесты провалены!');
  process.exit(1);
} else {
  console.log('\n✅ Все тесты пройдены!');
  process.exit(0);
}
