// item-forge/src/ModAmmoForms.tsx — мастера мода оружия и патрона (прототип P).
import React from 'react';
import { C, css } from './theme';
import { Field, TextInput, NumInput, Select, Chips, Panel, toggleIn } from './fields';
import {
  SLOT_OPTIONS, VANILLA_WEAPON_OPTIONS, MOD_OPS, QUALITY_CHANGE_OPS, MOD_RARITIES,
  AMMO_OPTIONS, DAMAGE_TYPE_OPTIONS, QUALITY_OPTIONS, EFFECT_OPTIONS,
} from './catalogs';
import type { Option } from './catalogs';
import type { SessionItem } from './pack';

const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

// ─── Мод оружия ─────────────────────────────────────────────────────────────

export const emptyMod = (): SessionItem => ({
  collection: 'weaponMods',
  data: {
    id: '', slot: 'Barrel', cost: 20, weight: 1, rarity: 'Common', complexity: 2,
    perk1: '', perk2: '', skill: 'REPAIR', materials: '',
    applies_to_ids: [],
    damageModifier: null, fireRateModifier: null,
    ammoOverride: '', damageTypeOverride: null,
    qualityChanges: [], effectChanges: [],
  },
  namePrimary: '', descriptionPrimary: '', nameOther: '', descriptionOther: '',
});

const OpEditor = ({ label, value, onChange }: {
  label: string;
  value: { op: string; value: number } | null;
  onChange: (v: { op: string; value: number } | null) => void;
}) => (
  <Field label={label} hint="выкл. = не трогает параметр">
    <div style={css.row}>
      <button type="button" style={css.chip(!!value)} onClick={() => onChange(value ? null : { op: '+', value: 1 })}>
        {value ? 'вкл' : 'выкл'}
      </button>
      {value && (
        <>
          <select style={{ ...css.input, width: 90 }} value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value })}>
            {MOD_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            style={{ ...css.input, width: 110 }}
            type="number"
            value={value.value}
            onChange={(e) => onChange({ ...value, value: Number(e.target.value) || 0 })}
          />
        </>
      )}
    </div>
  </Field>
);

const ChangesEditor = ({ label, rows, options, onChange, withValue }: {
  label: string;
  rows: any[];
  options: Option[];
  onChange: (rows: any[]) => void;
  withValue?: boolean;
}) => (
  <Field label={label}>
    {rows.map((row: any, i: number) => (
      <div key={i} style={{ ...css.row, marginBottom: 6 }}>
        <select style={{ ...css.input, width: 100 }} value={row.op} onChange={(e) => onChange(rows.map((r, j) => j === i ? { ...r, op: e.target.value } : r))}>
          {QUALITY_CHANGE_OPS.map((op) => <option key={op} value={op}>{op === 'gain' ? 'дать' : 'снять'}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Select value={row.id} onChange={(id) => onChange(rows.map((r, j) => j === i ? { ...r, id } : r))} options={options} filterable />
        </div>
        {withValue && (
          <input
            style={{ ...css.input, width: 90 }}
            type="number"
            value={row.value ?? ''}
            placeholder="ур."
            onChange={(e) => onChange(rows.map((r, j) => j === i ? { ...r, value: Number(e.target.value) || 1 } : r))}
          />
        )}
        <button type="button" style={css.btnGhost} onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button>
      </div>
    ))}
    <button
      type="button"
      style={css.btnGhost}
      onClick={() => onChange([...rows, { op: 'gain', id: options[0]?.id ?? '', ...(withValue ? { value: 1 } : {}) }])}
    >
      + строка
    </button>
  </Field>
);

export function ModForm({ draft, ownWeapons, onChange }: {
  draft: SessionItem;
  ownWeapons: Option[];
  onChange: (draft: SessionItem) => void;
}) {
  const d = draft.data;
  const set = (patch: Record<string, any>) => onChange({ ...draft, data: { ...d, ...patch } });
  const appliesIds: string[] = d.applies_to_ids ?? [];
  const weaponOptions: Option[] = [
    ...ownWeapons,
    ...VANILLA_WEAPON_OPTIONS.filter((w) => !ownWeapons.some((o) => o.id === w.id)),
  ];
  const slotOptions = SLOT_OPTIONS;

  return (
    <>
      <Panel title="Модификация оружия (параметры — как у модов сеттинга)">
        <Field label="id (суффикс)"><TextInput value={d.id} onChange={(v) => set({ id: sanitize(v) })} placeholder="напр. nail_drum" /></Field>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Слот"><Select value={d.slot} onChange={(v) => set({ slot: v })} options={slotOptions} /></Field></div>
          <div style={{ flex: 1 }}>
            <Field label="Редкость">
              <Select value={d.rarity} onChange={(v) => set({ rarity: v })} options={MOD_RARITIES.map((r) => ({ id: r, label: r }))} />
            </Field>
          </div>
          <div style={{ flex: 1 }}><Field label="Сложность"><NumInput value={d.complexity} onChange={(v) => set({ complexity: v === '' ? 0 : v })} /></Field></div>
        </div>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Цена"><NumInput value={d.cost} onChange={(v) => set({ cost: v === '' ? 0 : v })} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Вес"><NumInput step="0.1" value={d.weight} onChange={(v) => set({ weight: v === '' ? 0 : v })} /></Field></div>
        </div>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Треб. перк 1"><TextInput value={d.perk1 ?? ''} onChange={(v) => set({ perk1: v })} placeholder="Gun Nut 2" /></Field></div>
          <div style={{ flex: 1 }}><Field label="Треб. перк 2"><TextInput value={d.perk2 ?? ''} onChange={(v) => set({ perk2: v })} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Навык"><TextInput value={d.skill ?? ''} onChange={(v) => set({ skill: v })} placeholder="REPAIR" /></Field></div>
        </div>
        <Field label="Материалы (текст рецепта)"><TextInput value={d.materials ?? ''} onChange={(v) => set({ materials: v })} placeholder="Common x 4 Uncommon x 2" /></Field>
        <Field label="Подходит к оружию" hint="своё из пакета и/или ванильное">
          <Chips options={weaponOptions} selected={appliesIds} onToggle={(id) => set({ applies_to_ids: toggleIn(appliesIds, id) })} />
        </Field>
      </Panel>

      <Panel title="Что меняет мод (операции — как в данных сеттинга: +, −, set)">
        <OpEditor label="Урон" value={d.damageModifier} onChange={(v) => set({ damageModifier: v })} />
        <OpEditor label="Темп" value={d.fireRateModifier} onChange={(v) => set({ fireRateModifier: v })} />
        <Field label="Замена боеприпаса" hint="ammoOverride">
          <Select
            value={d.ammoOverride ?? ''}
            onChange={(v) => set({ ammoOverride: v })}
            options={AMMO_OPTIONS}
            allowEmpty="— не меняет —"
            filterable
          />
        </Field>
        <ChangesEditor label="Качества" rows={d.qualityChanges ?? []} options={QUALITY_OPTIONS} withValue onChange={(rows) => set({ qualityChanges: rows })} />
        <ChangesEditor label="Эффекты урона" rows={d.effectChanges ?? []} options={EFFECT_OPTIONS} onChange={(rows) => set({ effectChanges: rows })} />
      </Panel>
    </>
  );
}

// ─── Патрон ─────────────────────────────────────────────────────────────────

export const emptyAmmo = (): SessionItem => ({
  collection: 'ammo',
  data: { id: '', rarity: 1, cost: 2, weight: 0.04 },
  namePrimary: '', descriptionPrimary: '', nameOther: '', descriptionOther: '',
});

export function AmmoForm({ draft, onChange }: { draft: SessionItem; onChange: (draft: SessionItem) => void }) {
  const d = draft.data;
  const set = (patch: Record<string, any>) => onChange({ ...draft, data: { ...d, ...patch } });
  return (
    <Panel title="Параметры патрона">
      <Field label="id (суффикс)"><TextInput value={d.id} onChange={(v) => set({ id: sanitize(v) })} placeholder="напр. nail" /></Field>
      <div style={{ ...css.row, gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Редкость (0–3)"><NumInput value={d.rarity} onChange={(v) => set({ rarity: v === '' ? 0 : v })} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Цена"><NumInput value={d.cost} onChange={(v) => set({ cost: v === '' ? 0 : v })} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Вес"><NumInput step="0.01" value={d.weight} onChange={(v) => set({ weight: v === '' ? 0 : v })} /></Field></div>
      </div>
      <Field label="Подсказка" hint="после создания используйте патрон в «Боеприпас» оружия">
        <div style={{ color: C.textDim, fontSize: 12 }}>
          Механику патрона диктует сам предмет: урон берётся из оружия, патрон — расходник по id.
        </div>
      </Field>
    </Panel>
  );
}
