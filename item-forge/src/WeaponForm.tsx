// item-forge/src/WeaponForm.tsx — мастер создания оружия (прототип P).
// Поля — точно по схеме modules/fallout/data/equipment/weapons.json +
// audience (решение владельца) + modSlots (совместимость с модами).
import React from 'react';
import { css } from './theme';
import { Field, TextInput, NumInput, Select, Chips, Panel, toggleIn } from './fields';
import {
  WEAPON_TYPE_OPTIONS, RANGE_OPTIONS, AMMO_OPTIONS, ATTR_OPTIONS, SKILL_OPTIONS,
  DAMAGE_TYPE_OPTIONS, QUALITY_OPTIONS, EFFECT_OPTIONS, AUDIENCE_OPTIONS,
  SLOT_OPTIONS, MOD_OPTIONS_BY_SLOT,
} from './catalogs';
import type { Option } from './catalogs';
import type { SessionItem } from './pack';

interface Props {
  draft: SessionItem;
  ownAmmo: Option[];          // свои патроны пакета (из сессии)
  ownModsBySlot: Record<string, Option[]>;
  onChange: (draft: SessionItem) => void;
}

const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

export const emptyWeapon = (): SessionItem => ({
  collection: 'weapons',
  data: {
    id: '', weaponType: 'Light', damage: 3, fireRate: 1, range: 'C',
    ammoId: '', mainAttr: 'AGI', mainSkill: 'SMALL_GUNS',
    weight: 2, cost: 50, rarity: 0,
    damageType: ['physical'], qualities: [], effects: [],
    audience: 'all', modSlots: {}, imageName: '',
  },
  namePrimary: '', descriptionPrimary: '', nameOther: '', descriptionOther: '',
});

export function WeaponForm({ draft, ownAmmo, ownModsBySlot, onChange }: Props) {
  const d = draft.data;
  const set = (patch: Record<string, any>) => onChange({ ...draft, data: { ...d, ...patch } });

  const qualityIds: string[] = (d.qualities ?? []).map((q: any) => q.qualityId ?? q);
  const effectIds: string[] = (d.effects ?? []).map((e: any) => e.effectId ?? e);
  const audience: string = d.audience ?? 'all';
  const audienceList: string[] = Array.isArray(audience) ? audience : (audience === 'all' ? [] : [audience]);

  const slots = Object.entries(d.modSlots ?? {}) as [string, string[]][];

  const ammoOptions: Option[] = [
    ...ownAmmo,
    ...AMMO_OPTIONS.filter((a) => !ownAmmo.some((o) => o.id === a.id)),
  ];

  return (
    <>
      <Panel title="Параметры">
        <Field label="id (суффикс)" hint={`станет hb_<пак>_${d.id || '…'}`}>
          <TextInput value={d.id} onChange={(v) => set({ id: sanitize(v) })} placeholder="напр. nailgun" />
        </Field>
        <Field label="Тип оружия">
          <Select value={d.weaponType} onChange={(v) => set({ weaponType: v })} options={WEAPON_TYPE_OPTIONS} />
        </Field>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Урон (кубы)"><NumInput value={d.damage} onChange={(v) => set({ damage: v === '' ? 0 : v })} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Темп"><NumInput value={d.fireRate} onChange={(v) => set({ fireRate: v === '' ? 0 : v })} /></Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Дальность"><Select value={d.range} onChange={(v) => set({ range: v })} options={RANGE_OPTIONS} /></Field>
          </div>
        </div>
        <Field label="Тип урона">
          <Chips
            options={DAMAGE_TYPE_OPTIONS}
            selected={Array.isArray(d.damageType) ? d.damageType : [d.damageType]}
            onToggle={(id) => {
              const cur = Array.isArray(d.damageType) ? d.damageType : [d.damageType];
              const next = toggleIn(cur.filter(Boolean), id);
              set({ damageType: next.length <= 1 ? (next[0] ?? 'physical') : next });
            }}
          />
        </Field>
        <Field label="Боеприпас" hint="— если без патронов">
          <Select
            value={d.ammoId ?? ''}
            onChange={(v) => set({ ammoId: v || null })}
            options={ammoOptions}
            allowEmpty="— без боеприпаса —"
            filterable
          />
        </Field>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Атрибут"><Select value={d.mainAttr} onChange={(v) => set({ mainAttr: v })} options={ATTR_OPTIONS} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Навык"><Select value={d.mainSkill} onChange={(v) => set({ mainSkill: v })} options={SKILL_OPTIONS} /></Field></div>
        </div>
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Вес"><NumInput step="0.1" value={d.weight} onChange={(v) => set({ weight: v === '' ? 0 : v })} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Цена"><NumInput value={d.cost} onChange={(v) => set({ cost: v === '' ? 0 : v })} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Редкость (0–3)"><NumInput value={d.rarity} onChange={(v) => set({ rarity: v === '' ? 0 : v })} /></Field></div>
        </div>
        <Field label="Картинка (имя/ссылка, необязательно)">
          <TextInput value={d.imageName ?? ''} onChange={(v) => set({ imageName: v })} />
        </Field>
      </Panel>

      <Panel title="Качества и эффекты урона (каталог сеттинга)">
        <Field label="Качества">
          <Chips options={QUALITY_OPTIONS} selected={qualityIds} onToggle={(id) => set({ qualities: toggleIn(qualityIds, id).map((qualityId) => ({ qualityId })) })} />
        </Field>
        <Field label="Эффекты урона">
          <Chips options={EFFECT_OPTIONS} selected={effectIds} onToggle={(id) => set({ effects: toggleIn(effectIds, id).map((effectId) => ({ effectId })) })} />
        </Field>
      </Panel>

      <Panel title="Для кого (аудитория)">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={css.chip(audience === 'all')} onClick={() => set({ audience: 'all' })}>Общедоступное</button>
          {AUDIENCE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              style={css.chip(audienceList.includes(o.id))}
              onClick={() => {
                const next = toggleIn(audienceList, o.id);
                set({ audience: next.length === 0 ? 'all' : next });
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Модификации (слоты и совместимые моды)">
        {slots.map(([slot, mods], idx) => {
          const options = [...(MOD_OPTIONS_BY_SLOT[slot] ?? []), ...(ownModsBySlot[slot] ?? [])];
          return (
            <div key={slot} style={{ marginBottom: 12, borderTop: `1px solid ${'#26303d'}`, paddingTop: 8 }}>
              <div style={{ ...css.row, marginBottom: 6 }}>
                <strong style={{ color: '#f0e68c' }}>{slot}</strong>
                <button
                  type="button"
                  style={css.btnGhost}
                  onClick={() => {
                    const next = { ...(d.modSlots ?? {}) };
                    delete next[slot];
                    set({ modSlots: next });
                  }}
                >
                  убрать слот
                </button>
              </div>
              <Chips
                options={options}
                selected={mods}
                onToggle={(id) => {
                  const next = { ...(d.modSlots ?? {}) };
                  next[slot] = toggleIn(next[slot] ?? [], id);
                  set({ modSlots: next });
                }}
              />
            </div>
          );
        })}
        <Select
          value=""
          onChange={(slot) => {
            if (!slot) return;
            if ((d.modSlots ?? {})[slot]) return;
            set({ modSlots: { ...(d.modSlots ?? {}), [slot]: [] } });
          }}
          options={SLOT_OPTIONS.filter((o) => !(d.modSlots ?? {})[o.id])}
          allowEmpty="+ добавить слот…"
        />
      </Panel>
    </>
  );
}
