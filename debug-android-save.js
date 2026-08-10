/**
 * Тест для отладки сохранения на Android браузерах
 */

// Имитируем Android браузер среду
const mockEnvironment = {
  isAndroid: () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent),
  isPWA: () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  hasWebShare: () => typeof navigator !== 'undefined' && navigator.canShare && navigator.share,
  hasFileSystemAccess: () => typeof window !== 'undefined' && 'showSaveFilePicker' in window,
  canUseAnchor: () => typeof document !== 'undefined'
};

console.log('=== Тест среды сохранения для Android ===\n');

// Проверяем доступные API
console.log('Доступные API в текущей среде:');
console.log('- Web Share API:', mockEnvironment.hasWebShare() ? '✅ Да' : '❌ Нет');
console.log('- File System Access API:', mockEnvironment.hasFileSystemAccess() ? '✅ Да' : '❌ Нет');
console.log('- Anchor Download:', mockEnvironment.canUseAnchor() ? '✅ Да' : '❌ Нет');
console.log('- Браузер Android:', mockEnvironment.isAndroid() ? '✅ Да' : '❌ Нет');
console.log('- Режим PWA:', mockEnvironment.isPWA() ? '✅ Да' : '❌ Нет');

console.log('\n=== Порядок методов сохранения ===');
console.log('1. Web Share API (navigator.share) - приоритет для мобильных');
console.log('   • Хорошо работает на Android Chrome в PWA режиме');
console.log('   • Позволяет пользователю выбрать куда сохранить');
console.log('   • Может не работать если файл слишком большой');
console.log('');
console.log('2. browser-fs-access (File System Access API)');
console.log('   • Работает на современных десктопах');
console.log('   • На Android может показывать диалог, но не сохранять');
console.log('   • Может требовать разрешений в PWA');
console.log('');
console.log('3. Anchor download (<a download>) - самый надежный');
console.log('   • Работает везде, включая старые браузеры');
console.log('   • Автоматически скачивает файл без выбора места');
console.log('   • На Android сохраняет в папку Downloads');
console.log('');

console.log('=== Проблема: открывается файловый менеджер, но не сохраняется ===');
console.log('Возможные причины:');
console.log('1. browser-fs-access показывает диалог, но не завершает сохранение');
console.log('2. Web Share API не поддерживает большие файлы или JSON');
console.log('3. Недостаточно разрешений в PWA режиме');
console.log('4. Браузер блокирует автоматическое скачивание');
console.log('');

console.log('=== Решение в коде: ===');
console.log('1. Сначала пробуем Web Share API - лучший для Android');
console.log('2. Если не работает, пробуем browser-fs-access');
console.log('3. Если и это не работает, используем anchor download');
console.log('4. ВСЕ ошибки ловим и логируем');
console.log('5. Добавляем Alert сообщения для пользователя');
console.log('');

// Проверяем наши изменения в коде
const fs = require('fs');
const path = require('path');

console.log('=== Проверка изменений в файлах ===\n');

const filesToCheck = [
  {
    path: 'src/utils/characterFileTransfer.js',
    checkpoints: [
      'Пробуем все доступные методы по порядку',
      'Web Share API',
      'browser-fs-access',
      'anchor download',
      'AbortError'
    ]
  },
  {
    path: 'components/screens/HomeScreen/logic/characterTransfer.js',
    checkpoints: [
      'methodsToTry',
      'Web Share API',
      'browser-fs-access',
      'anchor download',
      'fallback для Android'
    ]
  }
];

filesToCheck.forEach(fileInfo => {
  const fullPath = path.join(__dirname, fileInfo.path);
  if (fs.existsSync(fullPath)) {
    console.log(`Проверяем ${fileInfo.path}:`);
    const content = fs.readFileSync(fullPath, 'utf8');
    
    fileInfo.checkpoints.forEach(checkpoint => {
      if (content.includes(checkpoint)) {
        console.log(`  ✅ ${checkpoint}`);
      } else {
        console.log(`  ❌ ${checkpoint} не найден`);
      }
    });
    console.log('');
  } else {
    console.log(`❌ Файл не найден: ${fileInfo.path}\n`);
  }
});

console.log('=== Рекомендации для тестирования на Android ===');
console.log('1. Откройте DevTools в Chrome на ПК');
console.log('2. Подключите телефон через USB');
console.log('3. В DevTools выберите Remote Device');
console.log('4. Обновите приложение на телефоне');
console.log('5. Проверьте консоль при нажатии "Сохранить"');
console.log('6. Посмотрите какие методы вызываются и где ошибки');
console.log('');

console.log('=== Если все равно не работает: ===');
console.log('1. Проверьте консоль на наличие ошибок CORS или безопасности');
console.log('2. Попробуйте очистить кэш браузера');
console.log('3. Переустановите PWA (если установлено)');
console.log('4. Попробуйте другой браузер (Chrome, Firefox)');