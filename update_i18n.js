const fs = require('fs');

const ruPath = "i18n/ru-RU/screens/character/screen.json";
const enPath = "i18n/en-EN/screens/character/screen.json";

const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

Object.assign(ru.buttons = ru.buttons || {}, {
    "ok": "Хорошо",
    "understood": "Понятно",
    "selectTrait": "Выбрать черту",
    "confirmSelection": "Подтвердить выбор",
    "close": "Закрыть",
    "apply": "Применить"
});
Object.assign(en.buttons = en.buttons || {}, {
    "ok": "OK",
    "understood": "Understood",
    "selectTrait": "Select Trait",
    "confirmSelection": "Confirm Selection",
    "close": "Close",
    "apply": "Apply"
});

Object.assign(ru.origins = ru.origins || {}, {
    "assaultron": "Штурмотрон",
    "childOfAtom": "Дитя Атома",
    "ghoul": "Гуль",
    "minuteman": "Минитмен",
    "misterHandy": "Мистер Помощник",
    "ncr": "Житель НКР",
    "brotherhoodOutcast": "Изгой Братства Стали",
    "protectron": "Протектрон",
    "robobrain": "Робомозг",
    "supermutant": "Супермутант",
    "survivor": "Выживший",
    "vaultDweller": "Обитатель убежища"
});
Object.assign(en.origins = en.origins || {}, {
    "assaultron": "Assaultron",
    "childOfAtom": "Child of Atom",
    "ghoul": "Ghoul",
    "minuteman": "Minuteman",
    "misterHandy": "Mister Handy",
    "ncr": "NCR Citizen",
    "brotherhoodOutcast": "Brotherhood Outcast",
    "protectron": "Protectron",
    "robobrain": "Robobrain",
    "supermutant": "Supermutant",
    "survivor": "Survivor",
    "vaultDweller": "Vault Dweller"
});

Object.assign(ru.labels = ru.labels || {}, {
    "onePerk": "1 перк",
    "unknownItem": "Неизвестный предмет",
    "capsShort": "крышек",
    "pcsShort": "шт.",
    "physDR": "ФЗ",
    "enrgDR": "ЭЗ",
    "carry": "Груз",
    "requires": "Требует: ",
    "plating": "Обшивка",
    "armor": "Броня",
    "frame": "Рама",
    "mind": "Разум",
    "other": "Прочее",
    "body": "Корпус",
    "carryWeight": "Грузоподъёмность",
    "rarity": "Редкость",
    "complexity": "Сложность"
});
Object.assign(en.labels = en.labels || {}, {
    "onePerk": "1 perk",
    "unknownItem": "Unknown item",
    "capsShort": "caps",
    "pcsShort": "pcs.",
    "physDR": "Phys DR",
    "enrgDR": "Enrg DR",
    "carry": "Carry",
    "requires": "Requires: ",
    "plating": "Plating",
    "armor": "Armor",
    "frame": "Frame",
    "mind": "Mind",
    "other": "Other",
    "body": "Body",
    "carryWeight": "Carry Weight",
    "rarity": "Rarity",
    "complexity": "Complexity"
});

ru.modals = ru.modals || {};
en.modals = en.modals || {};

ru.modals.origins = ru.modals.origins || {};
en.modals.origins = en.modals.origins || {};
Object.assign(ru.modals.origins, {
    "survivorTitle": "Черта происхождения «Выживший»",
    "ncrTitle": "Черта происхождения «Житель НКР»"
});
Object.assign(en.modals.origins, {
    "survivorTitle": "Origin Trait «Survivor»",
    "ncrTitle": "Origin Trait «NCR Citizen»"
});

ru.modals.survivor = ru.modals.survivor || {};
en.modals.survivor = en.modals.survivor || {};
Object.assign(ru.modals.survivor, {
    "twoTraits": "2 черты",
    "twoTraitsDesc": "Любая комбинация: 2 Выжившего, 2 НКР или 1+1",
    "oneTraitOnePerk": "1 черта и 1 перк",
    "selectTwoTraitsHint": "Выберите 2 черты в любой комбинации.",
    "survivorTraitsList": "Список черт Выжившего",
    "ncrTraitsList": "Список черт НКР"
});
Object.assign(en.modals.survivor, {
    "twoTraits": "2 traits",
    "twoTraitsDesc": "Any combination: 2 Survivor, 2 NCR, or 1+1",
    "oneTraitOnePerk": "1 trait and 1 perk",
    "selectTwoTraitsHint": "Select 2 traits in any combination.",
    "survivorTraitsList": "Survivor Traits List",
    "ncrTraitsList": "NCR Traits List"
});

ru.modals.armor = ru.modals.armor || {};
en.modals.armor = en.modals.armor || {};
Object.assign(ru.modals.armor, {
    "upgradePlating": "Улучшить обшивку",
    "upgradeArmor": "Улучшить броню",
    "upgradeFrame": "Улучшить раму",
    "noItems": "Нет доступных предметов"
});
Object.assign(en.modals.armor, {
    "upgradePlating": "Upgrade Plating",
    "upgradeArmor": "Upgrade Armor",
    "upgradeFrame": "Upgrade Frame",
    "noItems": "No items available"
});

ru.modals.limb = ru.modals.limb || {};
en.modals.limb = en.modals.limb || {};
Object.assign(ru.modals.limb, {
    "upgradeLimb": "Модернизировать конечность",
    "noLimbs": "Нет доступных конечностей"
});
Object.assign(en.modals.limb, {
    "upgradeLimb": "Upgrade Limb",
    "noLimbs": "No limbs available"
});

fs.writeFileSync(ruPath, JSON.stringify(ru, null, 2) + '\n', 'utf8');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n', 'utf8');

console.log("Updated i18n JSONs!");
