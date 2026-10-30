// modules/fallout/gm/gmI18n.js
// Двуязычный словарь пространства Мастера (RU / EN):
// readonly-карточки персонажей со спойлерами и команды Мастера.

import { getCurrentLocale } from '../../../i18n/locale';

export const GM_DICTIONARIES = {
  'ru-RU': {
    roomBar: {
      groupCommand: 'Команда группе',
      deliveryBadge: 'Команда: {acked}/{total}',
      deliveryDone: 'Доставлено ({acked}/{total})',
      readonlyHint: 'Только просмотр · влияние на персонажей через команды и добычу',
      emptyPlayers: 'В этой комнате пока нет подключённых персонажей. Передайте адрес комнаты игрокам — их карточки со сводкой появятся здесь автоматически.',
    },
    card: {
      levelShort: 'Ур. {level}',
      online: 'В сети',
      offline: 'Не в сети',
      commandBtn: 'Команда',
      expandAll: 'Раскрыть всё',
      collapseAll: 'Свернуть всё',
      vitals: {
        hp: 'ОЗ',
        rad: 'Рад',
        defense: 'Защита',
        initiative: 'Иниц.',
        melee: 'Бонус ББ',
        luck: 'Удача',
        weight: 'Груз',
        caps: 'Крышки',
      },
      spoilers: {
        specialAndSkills: 'S.P.E.C.I.A.L. и Навыки',
        armorAndConditions: 'Защита по зонам и состояния',
        weaponsAndAmmo: 'Оружие и боезапас',
        perksAndInventory: 'Перки, черта и инвентарь',
      },
      attributes: {
        STR: 'СИЛ',
        PER: 'ВОС',
        END: 'ВЫН',
        CHA: 'ХАР',
        INT: 'ИНТ',
        AGI: 'ЛОВ',
        LCK: 'УДЧ',
      },
      skillsTable: {
        skill: 'Навык',
        attr: 'Атр.',
        rank: 'Ранг',
        tn: 'ПП',
      },
      armorTable: {
        zone: 'Зона',
        hitRoll: 'Куб',
        phys: 'ФУ',
        energy: 'ЭУ',
        rad: 'РУ',
        paHp: 'ОЗ СБ',
        none: '—',
        zones: {
          head: 'Голова',
          body: 'Торс',
          leftArm: 'Л. рука',
          rightArm: 'П. рука',
          leftLeg: 'Л. нога',
          rightLeg: 'П. нога',
        },
        hitRolls: {
          head: '1–2',
          body: '3–8',
          leftArm: '9–11',
          rightArm: '12–14',
          leftLeg: '15–17',
          rightLeg: '18–20',
        },
      },
      status: {
        immunities: 'Иммунитеты',
        radImmunity: 'Радиация',
        poisonImmunity: 'Яд',
        conditions: 'Состояния и эффекты',
        noConditions: 'Активных состояний и эффектов нет',
        survival: 'Выживание',
        food: 'Сытость',
        water: 'Жажда',
        sleep: 'Сон',
      },
      weapons: {
        empty: 'Оружие не экипировано',
        damage: 'Урон',
        fireRate: 'СТР',
        range: 'Дист.',
        ammo: 'Патроны',
        noAmmoNeeded: 'Б/Б',
      },
      perks: {
        trait: 'Черта',
        noTrait: '—',
        perksTitle: 'Перки',
        noPerks: 'Перки ещё не выбраны',
        rankSuffix: 'р.{rank}',
        inventoryTitle: 'Инвентарь',
        emptyInventory: 'Инвентарь пуст',
      },
    },
    commands: {
      modalTitleRoom: 'Команда всей группе',
      modalTitleCharacter: 'Команда: {name}',
      targetRoomLabel: 'Получатели: все персонажи комнаты ({count})',
      targetCharLabel: 'Получатель: {name}',
      selectCommandLabel: 'Действие Мастера',
      amountLabel: 'Значение',
      noteLabel: 'Комментарий Мастера (необязательно)',
      notePlaceholder: 'Например: За зачистку Супер-Дупер Марта',
      sendBtn: 'Отправить команду',
      cancelBtn: 'Отмена',
      recentTitle: 'Последние команды в комнате',
      recentDelivery: '{acked}/{total} получено',
      kinds: {
        'level.grant': {
          title: 'Повысить уровень',
          short: '+{amount} ур.',
          hint: 'Поднимает уровень и открывает распределение навыков — игроки сами вручную раскидывают навыки и выбирают перк.',
        },
        'caps.grant': {
          title: 'Выдать крышки',
          short: '{sign}{amount} {CAP}',
          hint: 'Начисляет (или списывает со знаком минус) крышки в кошелёк персонажа.',
        },
        'luck.restore': {
          title: 'Восстановить очки Удачи',
          short: 'Удача: макс.',
          hint: 'Восстанавливает текущие очки Удачи до показателя атрибута УДЧ (начало новой сессии или вехи).',
        },
        'hp.heal': {
          title: 'Исцеление / Отдых (ОЗ)',
          short: 'ОЗ +{amount}',
          fullShort: 'Полный отдых (ОЗ)',
          modeFull: 'Полностью',
          modeAmount: 'На число',
          hint: 'Восстанавливает здоровье персонажа с учётом текущего потолка радиации.',
        },
        'rad.adjust': {
          title: 'Изменить радиацию',
          short: 'Рад {sign}{amount}',
          hint: 'Добавляет радиацию (положительное число) или снимает её (отрицательное). Иммунитет учитывается автоматически.',
        },
      },
      playerAlert: {
        title: 'Команда Мастера — {character}',
        levelUp: 'Ваш уровень повышен на +{delta} (теперь уровень {level})!\nОткройте лист персонажа, чтобы вручную распределить очки навыков и выбрать новый перк.',
        capsAdded: 'Получено крышек: +{delta} (всего: {total}).',
        capsSpent: 'Списано крышек: −{delta} (осталось: {total}).',
        luckRestored: 'Очки Удачи восстановлены до максимума ({luck}/{max}).',
        hpHealed: 'Здоровье восстановлено: {hp}/{max} ОЗ.',
        radImmune: 'Источник радиации (+{delta} рад) не подействовал благодаря вашему иммунитету.',
        radChanged: 'Уровень радиации изменён: теперь {rad} рад.',
        notePrefix: 'Сообщение Мастера: «{note}»',
      },
    },
  },
  'en-EN': {
    roomBar: {
      groupCommand: 'Party Command',
      deliveryBadge: 'Command: {acked}/{total}',
      deliveryDone: 'Delivered ({acked}/{total})',
      readonlyHint: 'Read-only view · affect characters via commands and loot/trade',
      emptyPlayers: 'No characters are connected to this room yet. Share the room code with your players — their live summary cards will appear here automatically.',
    },
    card: {
      levelShort: 'Lv. {level}',
      online: 'Online',
      offline: 'Offline',
      commandBtn: 'Command',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      vitals: {
        hp: 'HP',
        rad: 'Rad',
        defense: 'Defense',
        initiative: 'Init.',
        melee: 'Melee',
        luck: 'Luck',
        weight: 'Weight',
        caps: 'Caps',
      },
      spoilers: {
        specialAndSkills: 'S.P.E.C.I.A.L. & Skills',
        armorAndConditions: 'Zone DR & Status',
        weaponsAndAmmo: 'Weapons & Ammo',
        perksAndInventory: 'Perks, Trait & Inventory',
      },
      attributes: {
        STR: 'STR',
        PER: 'PER',
        END: 'END',
        CHA: 'CHA',
        INT: 'INT',
        AGI: 'AGI',
        LCK: 'LCK',
      },
      skillsTable: {
        skill: 'Skill',
        attr: 'Attr.',
        rank: 'Rank',
        tn: 'TN',
      },
      armorTable: {
        zone: 'Location',
        hitRoll: 'd20',
        phys: 'Phys',
        energy: 'Eng',
        rad: 'Rad',
        paHp: 'PA HP',
        none: '—',
        zones: {
          head: 'Head',
          body: 'Torso',
          leftArm: 'L. Arm',
          rightArm: 'R. Arm',
          leftLeg: 'L. Leg',
          rightLeg: 'R. Leg',
        },
        hitRolls: {
          head: '1–2',
          body: '3–8',
          leftArm: '9–11',
          rightArm: '12–14',
          leftLeg: '15–17',
          rightLeg: '18–20',
        },
      },
      status: {
        immunities: 'Immunities',
        radImmunity: 'Radiation',
        poisonImmunity: 'Poison',
        conditions: 'Conditions & Effects',
        noConditions: 'No active conditions or effects',
        survival: 'Survival',
        food: 'Hunger',
        water: 'Thirst',
        sleep: 'Sleep',
      },
      weapons: {
        empty: 'No weapons equipped',
        damage: 'Dmg',
        fireRate: 'FR',
        range: 'Range',
        ammo: 'Ammo',
        noAmmoNeeded: 'Melee',
      },
      perks: {
        trait: 'Trait',
        noTrait: '—',
        perksTitle: 'Perks',
        noPerks: 'No perks selected yet',
        rankSuffix: 'r.{rank}',
        inventoryTitle: 'Inventory',
        emptyInventory: 'Inventory is empty',
      },
    },
    commands: {
      modalTitleRoom: 'Command to Entire Party',
      modalTitleCharacter: 'Command: {name}',
      targetRoomLabel: 'Recipients: all room characters ({count})',
      targetCharLabel: 'Recipient: {name}',
      selectCommandLabel: 'GM Action',
      amountLabel: 'Value',
      noteLabel: 'GM Note (optional)',
      notePlaceholder: 'E.g. Cleared Super-Duper Mart',
      sendBtn: 'Send Command',
      cancelBtn: 'Cancel',
      recentTitle: 'Recent Room Commands',
      recentDelivery: '{acked}/{total} received',
      kinds: {
        'level.grant': {
          title: 'Grant Level Up',
          short: '+{amount} lv.',
          hint: 'Increases character level and unlocks skill allocation — players manually distribute their new skill points and pick a perk.',
        },
        'caps.grant': {
          title: 'Grant / Deduct Caps',
          short: '{sign}{amount} {CAP}',
          hint: 'Adds (or subtracts with a minus sign) caps directly to the character wallet.',
        },
        'luck.restore': {
          title: 'Restore Luck Points',
          short: 'Luck: Max',
          hint: 'Refills current Luck Points up to the character LCK attribute (session start or milestone).',
        },
        'hp.heal': {
          title: 'Heal / Rest (HP)',
          short: 'HP +{amount}',
          fullShort: 'Full Rest (HP)',
          modeFull: 'Full',
          modeAmount: 'By amount',
          hint: 'Restores character Health up to their radiation-adjusted maximum.',
        },
        'rad.adjust': {
          title: 'Adjust Radiation',
          short: 'Rad {sign}{amount}',
          hint: 'Adds radiation (positive) or removes it (negative). Radiation immunity is respected automatically.',
        },
      },
      playerAlert: {
        title: 'GM Command — {character}',
        levelUp: 'Your level increased by +{delta} (now Level {level})!\nOpen your character sheet to manually spend your skill points and choose a new perk.',
        capsAdded: 'Received caps: +{delta} (total: {total}).',
        capsSpent: 'Spent caps: −{delta} (remaining: {total}).',
        luckRestored: 'Luck Points restored to maximum ({luck}/{max}).',
        hpHealed: 'Health restored: {hp}/{max} HP.',
        radImmune: 'Radiation exposure (+{delta} rad) had no effect thanks to your immunity.',
        radChanged: 'Radiation updated: now {rad} rad.',
        notePrefix: 'GM Note: "{note}"',
      },
    },
  },
};

export const tGm = (path, localeOverride = null) => {
  const loc = localeOverride || getCurrentLocale();
  const dict = GM_DICTIONARIES[loc] || GM_DICTIONARIES['ru-RU'];
  let cur = dict;
  for (const part of String(path).split('.')) {
    cur = cur?.[part];
    if (cur === undefined) return path;
  }
  return cur;
};

export const formatGm = (template, vars = {}) => (
  String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ''
  ))
);
