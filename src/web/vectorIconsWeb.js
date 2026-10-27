// Узкая веб-точка входа для @expo/vector-icons (патч 453).
//
// Штатный пакет @expo/vector-icons в IconsLazy.js делает жадный require()
// всех 15 семейств иконок (AntDesign, Entypo, FontAwesome6, MaterialIcons и др.),
// затягивая в веб-бандл лишние карты глифов (~300+ КБ JS) и 14 неиспользуемых
// .ttf-файлов, конкурирующих за канал и сборку Metro.
//
// Приложение реально использует только три набора:
//   - MaterialCommunityIcons (бургер-меню, три точки, карточки, инвентарь, настройки)
//   - Ionicons (нижняя панель вкладок)
//   - FontAwesome5 (иконки Google Drive и Telegram в бургер-меню)

export { default as Ionicons } from '@expo/vector-icons/build/Ionicons';
export { default as MaterialCommunityIcons } from '@expo/vector-icons/build/MaterialCommunityIcons';
export { default as FontAwesome5, FA5Style } from '@expo/vector-icons/build/FontAwesome5';
export { default as createIconSet } from '@expo/vector-icons/build/createIconSet';
export { default as createIconSetFromFontello } from '@expo/vector-icons/build/createIconSetFromFontello';
export { default as createIconSetFromIcoMoon } from '@expo/vector-icons/build/createIconSetFromIcoMoon';
export { default as createMultiStyleIconSet } from '@expo/vector-icons/build/createMultiStyleIconSet';
