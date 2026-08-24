#!/usr/bin/env python3
"""One-shot splitter: move owner-classified setting strings into the module."""
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Nested key paths (dot) to MOVE from engine screen JSON into the module overlay.
MOVES = {
    "i18n/{loc}/screens/inventory/screen.json": [
        "caps",
        "alerts.radiationTitle",
        "alerts.radiationMessage",
        "alerts.radiationIncreaseMessage",
        "alerts.radiationDecreaseMessage",
        "alerts.robotCannotSelfUseTitle",
        "alerts.robotCannotSelfUseMessage",
        "alerts.robotOnlyWeaponTitle",
        "alerts.robotOnlyWeaponMessage",
        "alerts.robotBodyWeaponMismatchTitle",
        "alerts.robotBodyWeaponMismatchMessage",
        "alerts.manipulatorRequiredTitle",
        "alerts.manipulatorRequiredMessage",
        "alerts.robotNoHandlingLimbMessage",
        "alerts.manipulatorWeightTitle",
        "alerts.manipulatorWeightMessage",
        "alerts.robotCannotUseTwoHandedMessage",
        "alerts.robotArmorOnlyTitle",
        "alerts.robotArmorOnlyMessage",
        "alerts.powerArmorNeedsCoreTitle",
        "alerts.powerArmorNeedsCoreMessage",
        "alerts.powerArmorNeedsFrameMessage",
        "alerts.powerArmorDepletedTitle",
        "alerts.powerArmorDepletedMessage",
        "alerts.mutantCannotWearStandardArmorTitle",
        "alerts.mutantCannotWearStandardArmorMessage",
        "alerts.powerArmorChooseCoreTitle",
        "alerts.powerArmorBrokenPieceMessage",
        "alerts.mk2AppliedTitle",
        "alerts.mk2AppliedMessage",
        "alerts.mk2ApplyFailedTitle",
        "alerts.mk2Reason",
        "alerts.leadBellyRerollTitle",
        "alerts.leadBellyRerollMessage",
        "alerts.leadBellyRerollConfirm",
        "alerts.leadBellyRerollKeep",
        "foundItemTypes.caps",
        "labels.requiresMkII",
        "powerArmor",
    ],
    "i18n/{loc}/screens/inventory/modals/capsModal.json": ["*"],
    "i18n/{loc}/screens/inventory/modals/addItemModal.json": [
        "categories.powerArmor",
        "categories.robotEquipment",
        "categories.robotWeapons",
        "categories.robotPlating",
        "categories.robotArmorLayer",
        "categories.robotFrame",
        "categories.robotBodyParts",
        "categories.robotModules",
        "categories.robotMisc",
    ],
    "i18n/{loc}/screens/inventory/modals/buyItemModal.json": [
        "noCapsTitle",
        "noCapsMessage",
        "notEnoughCapsTitle",
        "notEnoughCapsMessage",
        "balance",
    ],
    "i18n/{loc}/screens/character/screen.json": [
        "labels.capsShort",
        "labels.physDR",
        "labels.enrgDR",
        "labels.plating",
        "labels.frame",
        "labels.mind",
        "labels.body",
        "alerts.spiritsFavorTitle",
        "alerts.spiritsFavorMessage",
        "skillsCatalog",
        "modals.ncrCitizen",
        "modals.origins",
        "modals.survivor",
        "modals.tribal",
        "modals.treeFamilies",
        "modals.armor.upgradePlating",
        "modals.armor.upgradeFrame",
        "modals.limb.upgradeLimb",
    ],
    "i18n/{loc}/screens/perksAndTraits/screen.json": [
        "errors.intensiveTrainingRequirements",
        "perkSelected.intensiveTrainingSuccess",
        "modal.attributeFilters",
    ],
    "i18n/{loc}/screens/weaponsAndArmor/screen.json": [
        "stats.meleeBonus",
        "stats.radiation",
        "stats.poisonResistance",
        "stats.defense",
        "effectsPanel.immunityTypes",
        "armor.slots",
        "armor.fields.physical",
        "armor.fields.energy",
        "armor.fields.radiation",
        "armor.groups",
        "weapon.rangeNames",
        "weapon.modSlots",
        "weapon.requiresMkII",
        "robotSlot",
        "robotSlots",
        "robotBodyUpgrade",
        "powerArmor",
        "kitResolver.currency",
        "kitResolver.currencyNcr",
        "robotLimbs",
    ],
    "i18n/{loc}/screens/home/screen.json": [
        "subtitle",
        "about.description",
    ],
}

HOME_ENGINE_REPLACEMENTS = {
    "ru-RU": {
        "subtitle": "Positronium",
        "about.description": "Positronium — менеджер персонажей для настольных ролевых игр: создание, хранение, редактирование, импорт/экспорт и облачная синхронизация.",
    },
    "en-EN": {
        "subtitle": "Positronium",
        "about.description": "Positronium is a tabletop RPG character manager: create, store, edit, import/export, and sync characters to the cloud.",
    },
}

APP_TAB_MOVES = ["tabs.character", "tabs.equipment", "tabs.inventory", "tabs.perks"]


def get_path(obj, parts):
    cur = obj
    for p in parts:
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def pop_path(obj, parts):
    if len(parts) == 1:
        return obj.pop(parts[0], None)
    head, *rest = parts
    if head not in obj or not isinstance(obj[head], dict):
        return None
    val = pop_path(obj[head], rest)
    if obj[head] == {}:
        del obj[head]
    return val


def put_path(obj, parts, value):
    cur = obj
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = value


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    for loc in ("ru-RU", "en-EN"):
        for pattern, keys in MOVES.items():
            engine_rel = pattern.format(loc=loc)
            engine_path = ROOT / engine_rel
            module_rel = engine_rel.replace("i18n/", "modules/fallout/i18n/", 1)
            module_path = ROOT / module_rel
            engine = load(engine_path)
            overlay = {}
            if keys == ["*"]:
                overlay = deepcopy(engine)
                # keep file in engine as empty object? better leave a stub comment-less {}
                engine = {}
            else:
                for key in keys:
                    parts = key.split(".")
                    val = get_path(engine, parts)
                    if val is None:
                        raise SystemExit(f"missing {engine_rel} {key}")
                    put_path(overlay, parts, deepcopy(val))
                    pop_path(engine, parts)
            if engine_rel.endswith("home/screen.json"):
                repl = HOME_ENGINE_REPLACEMENTS[loc]
                engine["subtitle"] = repl["subtitle"]
                engine.setdefault("about", {})["description"] = repl["about.description"]
            dump(engine_path, engine)
            dump(module_path, overlay)

        app_path = ROOT / f"i18n/{loc}/App.json"
        app = load(app_path)
        app_overlay = {}
        for key in APP_TAB_MOVES:
            parts = key.split(".")
            val = get_path(app, parts)
            if val is None:
                raise SystemExit(f"missing App.json {key}")
            put_path(app_overlay, parts, deepcopy(val))
            pop_path(app, parts)
        dump(app_path, app)
        dump(ROOT / f"modules/fallout/i18n/{loc}/App.json", app_overlay)

    print("split ok")


if __name__ == "__main__":
    main()
