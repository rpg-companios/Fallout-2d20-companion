// Реестр группы «рецепты» (270): манифест и файлы-разделы — одна точка.
// Реестр домена читает отсюда и порядок категорий, и строки: новый файл
// рецептуры = импорт здесь + строка в index.json, движок и окно не трогаем.
import recipeIndex from './index.json';
import ammo from './ammo.json';
import weapons from './weapons.json';
import chems from './chems.json';
import food from './food.json';
import drinks from './drinks.json';

export const RECIPE_FILES = {
  'ammo.json': ammo,
  'weapons.json': weapons,
  'chems.json': chems,
  'food.json': food,
  'drinks.json': drinks,
};

export const RECIPE_MANIFEST = recipeIndex;
