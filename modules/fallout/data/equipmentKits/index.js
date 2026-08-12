// modules/fallout/data/equipmentKits/index.js
// Индекс комплектов модуля (сеттинг).
//
// Комплекты разложены по файлам — по одному на фракцию/группу
// (brotherhood.json, ncr.json, treefamilies.json и т.д.), чтобы каталог
// оставался поддерживаемым при росте числа комплектов (1к, 1м…).
// Этот индекс объединяет их в один объект { [kitId]: { items } }.
//
// ПРАВИЛО (владелец): новый комплект = новый файл (или запись в файле
// своей фракции) + строка импорта здесь. Движок не трогается.

import brotherhood from './brotherhood.json';
import brotherhoodOutcast from './brotherhoodOutcast.json';
import childOfAtom from './childOfAtom.json';
import defaultKit from './default.json';
import minuteman from './minuteman.json';
import misterHandy from './misterHandy.json';
import ncr from './ncr.json';
import protectron from './protectron.json';
import robobrain from './robobrain.json';
import securitron from './securitron.json';
import superMutant from './superMutant.json';
import vaultDweller from './vaultDweller.json';
import wastelander from './wastelander.json';
import treefamilies from './treefamilies.json';

export default {
  ...brotherhood,
  ...brotherhoodOutcast,
  ...childOfAtom,
  ...defaultKit,
  ...minuteman,
  ...misterHandy,
  ...ncr,
  ...protectron,
  ...robobrain,
  ...securitron,
  ...superMutant,
  ...vaultDweller,
  ...wastelander,
  ...treefamilies,
};
