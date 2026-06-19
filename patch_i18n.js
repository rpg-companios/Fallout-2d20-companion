const fs = require('fs');
const path = require('path');

const TRAITS_DIR = 'components/screens/CharacterScreen/modals/traits';
const MODALS_DIR = 'components/screens/CharacterScreen/modals';

const i18nMappings = {
  "Штурмотрон": "tCharacterScreen('origins.assaultron')",
  "Братство Стали": "tCharacterScreen('origins.brotherhoodOfSteel')",
  "Дитя Атома": "tCharacterScreen('origins.childOfAtom')",
  "Гуль": "tCharacterScreen('origins.ghoul')",
  "Минитмен": "tCharacterScreen('origins.minuteman')",
  "Мистер Помощник": "tCharacterScreen('origins.misterHandy')",
  "Житель НКР": "tCharacterScreen('origins.ncr')",
  "Черта происхождения «Житель НКР»": "tCharacterScreen('modals.origins.ncrTitle')",
  "Изгой Братства Стали": "tCharacterScreen('origins.brotherhoodOutcast')",
  "Протектрон": "tCharacterScreen('origins.protectron')",
  "Робомозг": "tCharacterScreen('origins.robobrain')",
  "Супермутант": "tCharacterScreen('origins.supermutant')",
  "Выживший": "tCharacterScreen('origins.survivor')",
  "Черта происхождения «Выживший»": "tCharacterScreen('modals.origins.survivorTitle')",
  "Обитатель убежища": "tCharacterScreen('origins.vaultDweller')",
  
  "Хорошо": "tCharacterScreen('buttons.ok')",
  "Выбрать": "tCharacterScreen('buttons.select')",
  "Отмена": "tCharacterScreen('buttons.cancel')",
  "Понятно": "tCharacterScreen('buttons.understood')",
  "Выбрать черту": "tCharacterScreen('buttons.selectTrait')",
  "Закрыть": "tCharacterScreen('buttons.close')",
  "Применить": "tCharacterScreen('buttons.apply')",
  
  "2 черты": "tCharacterScreen('modals.survivor.twoTraits')",
  "Любая комбинация: 2 Выжившего, 2 НКР или 1+1": "tCharacterScreen('modals.survivor.twoTraitsDesc')",
  "1 черта и 1 перк": "tCharacterScreen('modals.survivor.oneTraitOnePerk')",
  "1 черта и 1 perk": "tCharacterScreen('modals.survivor.oneTraitOnePerk')",
  "Выберите 2 черты в любой комбинации.": "tCharacterScreen('modals.survivor.selectTwoTraitsHint')",
  "Список черт Выжившего": "tCharacterScreen('modals.survivor.survivorTraitsList')",
  "Список черт НКР": "tCharacterScreen('modals.survivor.ncrTraitsList')",
  "Подтвердить выбор": "tCharacterScreen('buttons.confirmSelection')",

  "Обшивка": "tCharacterScreen('labels.plating', 'Plating')",
  "Броня": "tCharacterScreen('labels.armor', 'Armor')",
  "Рама": "tCharacterScreen('labels.frame', 'Frame')"
};

function patchFile(filePath, isTrait) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Add import
  if (!content.includes('tCharacterScreen')) {
    const importPath = isTrait ? '../../logic/characterScreenI18n' : '../logic/characterScreenI18n';
    const importStmt = `import { tCharacterScreen } from '${importPath}';\n`;
    
    // find last import
    const importMatches = [...content.matchAll(/^import .*?;?$/gm)];
    if (importMatches.length > 0) {
      const lastImport = importMatches[importMatches.length - 1];
      const pos = lastImport.index + lastImport[0].length;
      content = content.slice(0, pos) + '\n' + importStmt + content.slice(pos);
    } else {
      content = importStmt + content;
    }
  }

  // Trait config fix
  content = content.replace(/traitName: '[^']+',\s*/, '');

  // Literal replacements
  content = content.replace(/infoOnly \? 'Понятно' : 'Выбрать черту'/g, "infoOnly ? tCharacterScreen('buttons.understood') : tCharacterScreen('buttons.selectTrait')");
  content = content.replace(/`\$\{originLabel\}: \$\{selectedNames\[0\]\} \+ 1 перк`/g, "`${originLabel}: ${selectedNames[0]} + ` + tCharacterScreen('labels.onePerk', '1 perk')");
  content = content.replace(/'Черта происхождения «Выживший»'/g, "tCharacterScreen('modals.origins.survivorTitle')");
  content = content.replace(/'Выживший'/g, "tCharacterScreen('origins.survivor')");
  content = content.replace(/'Черта происхождения «Житель НКР»'/g, "tCharacterScreen('modals.origins.ncrTitle')");
  content = content.replace(/'Житель НКР'/g, "tCharacterScreen('origins.ncr')");

  for (const [ru, code] of Object.entries(i18nMappings)) {
    content = content.split(`>${ru}<`).join(`>{${code}}<`);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Patched ${filePath}`);
  }
}

// 1. Patch traits
if (fs.existsSync(TRAITS_DIR)) {
  fs.readdirSync(TRAITS_DIR).forEach(file => {
    if (file.endsWith('.js') && file !== 'index.js') {
      patchFile(path.join(TRAITS_DIR, file), true);
    }
  });
}

// 2. Patch specific modals
const modalsToPatch = [
  'ArmorLayerModal.js',
  'ArmorPickerModal.js',
  'EquipmentKitModal.js',
  'LimbUpgradeModal.js'
];

modalsToPatch.forEach(file => {
  patchFile(path.join(MODALS_DIR, file), false);
});

// For complex files we can do specific replacements
const armorLayerPath = path.join(MODALS_DIR, 'ArmorLayerModal.js');
if (fs.existsSync(armorLayerPath)) {
  let content = fs.readFileSync(armorLayerPath, 'utf8');
  content = content.replace(/isRu \? 'Улучшить обшивку' : 'Upgrade Plating'/g, "tCharacterScreen('modals.armor.upgradePlating', 'Upgrade Plating')");
  content = content.replace(/isRu \? 'Улучшить броню'   : 'Upgrade Armor'/g, "tCharacterScreen('modals.armor.upgradeArmor', 'Upgrade Armor')");
  content = content.replace(/isRu \? 'Улучшить раму'    : 'Upgrade Frame'/g, "tCharacterScreen('modals.armor.upgradeFrame', 'Upgrade Frame')");
  content = content.replace(/isRu \? 'Улучшить броню' : 'Upgrade Armor'/g, "tCharacterScreen('modals.armor.upgradeArmor', 'Upgrade Armor')");
  content = content.replace(/isRu \? 'ФЗ' : 'Phys DR'/g, "tCharacterScreen('labels.physDR', 'Phys DR')");
  content = content.replace(/isRu \? 'ЭЗ' : 'Enrg DR'/g, "tCharacterScreen('labels.enrgDR', 'Enrg DR')");
  content = content.replace(/isRu \? 'Груз' : 'Carry'/g, "tCharacterScreen('labels.carry', 'Carry')");
  content = content.replace(/isRu \? 'Требует: ' : 'Requires: '/g, "tCharacterScreen('labels.requires', 'Requires: ')");
  content = content.replace(/isRu \? 'Нет доступных предметов' : 'No items available'/g, "tCharacterScreen('modals.armor.noItems', 'No items available')");
  content = content.replace(/isRu \? 'Применить' : 'Apply'/g, "tCharacterScreen('buttons.apply', 'Apply')");
  content = content.replace(/isRu \? 'Закрыть' : 'Close'/g, "tCharacterScreen('buttons.close', 'Close')");
  fs.writeFileSync(armorLayerPath, content, 'utf8');
}

const limbPath = path.join(MODALS_DIR, 'LimbUpgradeModal.js');
if (fs.existsSync(limbPath)) {
  let content = fs.readFileSync(limbPath, 'utf8');
  content = content.replace(/label="Ближний бой"/g, 'label={tCharacterScreen("skillsCatalog.MELEE_WEAPONS", "Melee Weapons")}');
  content = content.replace(/label="Стрельба"/g, 'label={tCharacterScreen("skillsCatalog.SMALL_GUNS", "Small Guns")}');
  content = content.replace(/label="Разум"/g, 'label={tCharacterScreen("labels.mind", "Mind")}');
  content = content.replace(/label="Прочее"/g, 'label={tCharacterScreen("labels.other", "Other")}');
  content = content.replace(/label="Корпус"/g, 'label={tCharacterScreen("labels.body", "Body")}');
  content = content.replace(/label="Грузоподъёмность"/g, 'label={tCharacterScreen("labels.carryWeight", "Carry Weight")}');
  content = content.replace(/label="Редкость"/g, 'label={tCharacterScreen("labels.rarity", "Rarity")}');
  content = content.replace(/label="Сложность"/g, 'label={tCharacterScreen("labels.complexity", "Complexity")}');
  content = content.replace(/Требует: /g, '{tCharacterScreen("labels.requires", "Requires: ")}');
  content = content.replace(/Модернизировать конечность/g, '{tCharacterScreen("modals.limb.upgradeLimb", "Upgrade Limb")}');
  content = content.replace(/Нет доступных конечностей/g, '{tCharacterScreen("modals.limb.noLimbs", "No limbs available")}');
  fs.writeFileSync(limbPath, content, 'utf8');
}

const equipPath = path.join(MODALS_DIR, 'EquipmentKitModal.js');
if (fs.existsSync(equipPath)) {
  let content = fs.readFileSync(equipPath, 'utf8');
  content = content.replace(/'Неизвестный предмет'/g, "tCharacterScreen('labels.unknownItem', 'Unknown item')");
  content = content.replace(/` \(\$\{qty\} крышек\)`/g, "` (${qty} ${tCharacterScreen('labels.capsShort', 'caps')})`");
  content = content.replace(/` \(\$\{qty\} шт\.\)`/g, "` (${qty} ${tCharacterScreen('labels.pcsShort', 'pcs.')})`");
  content = content.replace(/`\$\{qty\} шт\.`/g, "`${qty} ${tCharacterScreen('labels.pcsShort', 'pcs.')}`");
  content = content.replace(/'0 шт\.'/g, "`0 ${tCharacterScreen('labels.pcsShort', 'pcs.')}`");
  fs.writeFileSync(equipPath, content, 'utf8');
}

const armorPickerPath = path.join(MODALS_DIR, 'ArmorPickerModal.js');
if (fs.existsSync(armorPickerPath)) {
  let content = fs.readFileSync(armorPickerPath, 'utf8');
  content = content.replace(/isRu \? 'Обшивка' : 'Plating'/g, "tCharacterScreen('labels.plating', 'Plating')");
  content = content.replace(/isRu \? 'Броня' : 'Armor'/g, "tCharacterScreen('labels.armor', 'Armor')");
  content = content.replace(/isRu \? 'Рама' : 'Frame'/g, "tCharacterScreen('labels.frame', 'Frame')");
  content = content.replace(/isRu \? '—' : '—'/g, "'—'");
  fs.writeFileSync(armorPickerPath, content, 'utf8');
}

console.log("Done patching files!");
