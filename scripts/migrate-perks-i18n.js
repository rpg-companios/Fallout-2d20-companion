// Migrates perk names/descriptions from assets/Perks/perks.json into i18n files
// Run: node scripts/migrate-perks-i18n.js

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Load old perks data
const oldPerks = JSON.parse(fs.readFileSync(path.join(root, 'assets/Perks/perks.json'), 'utf8'));

// Load new structural data to get the canonical id list
const newPerks = JSON.parse(fs.readFileSync(path.join(root, 'data/perks/perks.json'), 'utf8'));

// Build a map: Russian name (uppercase) -> { name, descriptions by rank }
// Old file has one entry per rank, we want rank-1 description as the base effect text
const ruMap = {};
for (const p of oldPerks) {
    const key = p.perk_name.trim().toUpperCase();
    if (!ruMap[key]) {
        ruMap[key] = { name: p.perk_name, descriptions: {} };
    }
    ruMap[key].descriptions[p.rank] = p.description;
}

// Manual mapping: new camelCase id -> Russian perk_name (uppercase key in ruMap)
const ID_TO_RU_KEY = {
    animalFriend: 'ДРУГ ЖИВОТНЫХ',
    aquaboy: 'АКВАБОЙ ИЛИ АКВАГЁРЛ',
    radResistant: 'УСТОЙЧИВОСТЬ К РАДИАЦИИ',
    armorer: 'БРОННИК',
    barbarian: 'ВАРВАР',
    gunFu: 'ГАН-ФУ',
    silverTongue: 'ТРЕПАЧ',
    blitz: 'БЛИЦ',
    leadBelly: 'СВИНЦОВОЕ БРЮХО',
    juryRigging: 'ОЧУМЕЛЫЕ РУЧКИ',
    scoundrel: 'НЕГОДЯЙ',
    dogmeat: 'ПСИНА',
    hunter: 'ОХОТНИК',
    chemist: 'ХИМИК',
    shotgunSurgeon: 'ХИРУРГ С ДРОБОВИКОМ',
    movingTarget: 'ДВИЖУЩАЯСЯ МИШЕНЬ',
    basher: 'УДАРНИК',
    laserCommander: 'ЛАЗЕРОВ НАЧАЛЬНИК',
    commando: 'КОММАНДОС',
    comprehension: 'ПОНИМАНИЕ',
    canOpener: 'КОНСЕРВАТОР!',
    betterCriticals: 'УЛУЧШЕННЫЕ КРИТЫ',
    quickDraw: 'БЫСТРЫЙ ДОСТУП',
    fortuneFinder: 'ИСКАТЕЛЬ УДАЧИ',
    solarPowered: 'СОЛНЕЧНАЯ БАТАРЕЙКА',
    entomologist: 'ЭНТОМОЛОГ',
    intenseTraining: 'ИНТЕНСИВНЫЕ ТРЕНИРОВКИ',
    demolitionExpert: 'ЭКСПЕРТ ПОДРЫВНИК',
    roboticsExpert: 'ЭКСПЕРТ ПО РОБОТОТЕХНИКЕ',
    gunNut: 'ФАНАТИК ОРУЖИЯ',
    capCollector: 'КОЛЛЕКЦИОНЕР КРЫШЕК',
    ghost: 'ПРИЗРАК',
    scrounger: 'МУСОРЩИК',
    pharmaFarmer: 'ФАРМА-ФЕРМЕР',
    partyBoy: 'ТУСОВЩИК',
    finesse: 'ТОЧНОСТЬ',
    heavyHitter: 'ВЫСШАЯ ЛИГА',
    blacksmith: 'КУЗНЕЦ',
    piercingStrike: 'ПРОНИКАЮЩИЙ УДАР',
    rifleman: 'КАРАБИНЕР',
    meltdown: 'РАСПЫЛЕНИЕ',
    fastHealer: 'БЫСТРОЕ ИСЦЕЛЕНИЕ',
    medic: 'МЕДИК',
    heaveHo: 'ЛОВИ!',
    actionBoy: 'ЭКШН БОЙ ИЛИ ГЁРЛ',
    infiltrator: 'ЛАЗУТЧИК',
    nurse: 'ЛЕКАРЬ',
    sizeMatters: 'РАЗМЕР ИМЕЕТ ЗНАЧЕНИЕ',
    bullRush: 'ПОЕЗД БОЛИ',
    quickHands: 'ЛОВКИЕ РУКИ',
    masterThief: 'МАСТЕР ВОР',
    sandman: 'ПЕСОЧНЫЙ ЧЕЛОВЕК',
    fastMetabolism: 'БЫСТРЫЙ МЕТАБОЛИЗМ',
    mysteriousStranger: 'ТАИНСТВЕННЫЙ НЕЗНАКОМЕЦ',
    daringNature: 'ДЕРЗКАЯ НАТУРА',
    cautiousNature: 'ОСТОРОЖНАЯ НАТУРА',
    ninja: 'НИНДЗЯ',
    nightPerson: 'НОЧНОЕ СУЩЕСТВО',
    paralyzingPalm: 'ПАРАЛИЗУЮЩАЯ ЛАДОНЬ',
    nuclearPhysicist: 'ФИЗИК-ЯДЕРЩИК',
    pickpocket: 'КАРМАННИК',
    lightStep: 'ЛЁГКИЙ ШАГ',
    hacker: 'ХАКЕР',
    pathfinder: 'ПЕРВОПРОХОДЕЦ',
    gunslinger: 'СТРЕЛОК',
    ironFist: 'ЖЕЛЕЗНЫЙ КУЛАК',
    adrenalineRush: 'ВЫБРОС АДРЕНАЛИНА',
    intimidation: 'УЖАСАЮЩЕЕ ПРИСУТСТВИЕ',
    pyromaniac: 'ПИРОМАНЬЯК',
    nerdRage: 'ЯРОСТЬ БОТАНИКА!',
    snakeater: 'ПОЖИРАТЕЛЬ ЗМЕЙ',
    scrapper: 'БВРВХОЛЬЩИК',
    refractor: 'РЕФРАКТОР',
    strongBack: 'КРЕПКИЙ ХРЕБЕТ',
    chemResistant: 'УСТОЙЧИВОСТЬ К ХИМИИ',
    ricochet: 'РИКОШЕТ',
    toughness: 'ПРОЧНОСТЬ',
    bloodyMess: 'КРОВАВАЯ БАНЯ',
    science: 'НАУКА!',
    awareness: 'ОСВЕДОМЛЁННОСТЬ',
    sniper: 'СНАЙПЕР',
    inspirational: 'ВДОХНОВЛЯЮЩИЙ',
    tag: 'ОТМЕТКА!',
    adamantiumSkeleton: 'АДАМАНТИЕВЫЙ СКЕЛЕТ',
    educated: 'ТРЕНИРОВАННЫЙ',
    concentratedFire: 'СОСРЕДОТОЧЕННЫЙ ОГОНЬ',
    slacker: 'ЛОВКАЧ',
    triggerRush: 'ХАЛЯВЩИК',
    slayer: 'РУБАКА',
    killer: 'СПРИНТ МРАЧНОГО ЖНЕЦА',
    junktownVendor: 'ПРОДАВЕЦ ВЯЛЕНОГО МЯСА ИЗ ДЖАНКТАУНА',
    blackWidow: 'ЧЕРНАЯ ВДОВА ИЛИ УБИЙЦА ЖЕНЩИН',
    steadyAim: 'СТАБИЛЬНЫЙ ПРИЦЕЛ',
    lifeGiver: 'ДАЮЩИЙ ЖИЗНЬ',
};

// English display names from camelCase
function toDisplayName(id) {
    return id.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

// Build i18n arrays
const enResult = [];
const ruResult = [];

for (const perk of newPerks) {
    const ruKey = ID_TO_RU_KEY[perk.id];
    const ruEntry = ruKey ? ruMap[ruKey] || ruMap[ruKey.toUpperCase()] : null;

    // Try case-insensitive lookup as fallback
    let resolvedRu = ruEntry;
    if (!resolvedRu && ruKey) {
        const upperKey = ruKey.toUpperCase();
        for (const [k, v] of Object.entries(ruMap)) {
            if (k.toUpperCase() === upperKey) { resolvedRu = v; break; }
        }
    }

    const ruName = resolvedRu ? resolvedRu.name : toDisplayName(perk.id);
    const ruEffect = resolvedRu ? (resolvedRu.descriptions[1] || '') : '';

    enResult.push({ id: perk.id, name: toDisplayName(perk.id), effect: ruEffect });
    ruResult.push({ id: perk.id, name: ruName, effect: ruEffect });
}

fs.writeFileSync(
    path.join(root, 'i18n/en-EN/data/perks/perks.json'),
    JSON.stringify(enResult, null, 2)
);
fs.writeFileSync(
    path.join(root, 'i18n/ru-RU/data/perks/perks.json'),
    JSON.stringify(ruResult, null, 2)
);

console.log(`Migrated ${ruResult.length} perks.`);

// Report any unmapped ids
const unmapped = newPerks.filter(p => !ID_TO_RU_KEY[p.id] || !ruMap[ID_TO_RU_KEY[p.id]]);
if (unmapped.length) {
    console.log('\nUnmapped / not found in old data:');
    unmapped.forEach(p => {
        const key = ID_TO_RU_KEY[p.id];
        console.log(`  ${p.id} -> "${key}" (${ruMap[key] ? 'found' : 'NOT FOUND in old file'})`);
    });
}
