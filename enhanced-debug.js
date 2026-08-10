/**
 * Улучшенный тест для Android сохранений
 */

console.log('=== Улучшенная отладка для Android сохранений ===\n');

console.log('ПРОБЛЕМА: Файловый менеджер открывается, но файл не сохраняется');
console.log('ПРЕДПОЛОЖЕНИЕ: browser-fs-access открывает диалог, но не завершает сохранение\n');

console.log('=== НОВЫЙ ПОРЯДОК МЕТОДОВ (специально для Android) ===');
console.log('1. Проверяем, мобильное ли устройство');
console.log('2. Если ДА: сначала Web Share API, потом anchor download');
console.log('3. Если НЕТ: browser-fs-access, потом anchor download');
console.log('');

// Проверяем функцию определения мобильного устройства
const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent.toLowerCase();
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
};

console.log('Код для определения мобильного устройства:');
console.log('```javascript');
console.log('const isMobileDevice = () => {');
console.log('  if (typeof navigator === \'undefined\') return false;');
console.log('  const userAgent = navigator.userAgent.toLowerCase();');
console.log('  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);');
console.log('};');
console.log('```\n');

console.log('=== Улучшаем код сохранения ===');
console.log('Добавляем проверку isMobileDevice() для определения порядка методов:\n');

console.log('Новая логика:');
console.log('if (isMobileDevice()) {');
console.log('  // Android/iOS: Web Share API → anchor download');
console.log('  methodsToTry = ["share", "anchor"];');
console.log('} else {');
console.log('  // Desktop: browser-fs-access → Web Share API → anchor download');
console.log('  methodsToTry = ["fsaccess", "share", "anchor"];');
console.log('}');
console.log('');

console.log('=== Проверяем текущую реализацию ===');

const fs = require('fs');
const path = require('path');

const checkFile = (filePath, mobileDetection = false) => {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ Файл не найден: ${filePath}`);
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  
  if (mobileDetection) {
    // Проверяем наличие проверки мобильного устройства
    const hasMobileCheck = content.includes('userAgent') || 
                          content.includes('mobile') || 
                          content.includes('android') ||
                          content.includes('iPhone') ||
                          content.includes('Platform.OS');
    
    console.log(`📱 Проверка мобильного устройства в ${filePath}: ${hasMobileCheck ? '✅ Есть' : '❌ Нет'}`);
    
    if (!hasMobileCheck) {
      console.log('   Рекомендую добавить:');
      console.log('   ```javascript');
      console.log('   const isMobileDevice = () => {');
      console.log('     if (typeof navigator === \'undefined\') return false;');
      console.log('     const userAgent = navigator.userAgent.toLowerCase();');
      console.log('     return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);');
      console.log('   };');
      console.log('   ```');
    }
  }
  
  return true;
};

console.log('\nПроверяем файлы:');
checkFile('src/utils/characterFileTransfer.js', true);
checkFile('components/screens/HomeScreen/logic/characterTransfer.js', true);

console.log('\n=== ЧТО ДЕЛАТЬ СЕЙЧАС ===');
console.log('1. Обновить приложение на Android устройстве');
console.log('2. Проверить консоль браузера (через remote debugging)');
console.log('3. Посмотреть какой метод вызывается первым');
console.log('4. Если видно "browser-fs-access" на Android - это проблема!');
console.log('5. Надо добавить проверку isMobileDevice()');
console.log('');

console.log('=== АЛЬТЕРНАТИВНОЕ РЕШЕНИЕ ===');
console.log('Если сложно добавить проверку мобильного устройства, можно:');
console.log('1. Всегда начинать с Web Share API на вебе (он есть в Android/iOS)');
console.log('2. Если Web Share API не доступен, пробовать browser-fs-access');
console.log('3. Всегда иметь anchor download как последний fallback');
console.log('');
console.log('Этот подход проще и тоже должен работать на Android!');