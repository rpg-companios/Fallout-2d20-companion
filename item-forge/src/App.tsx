// item-forge/src/App.tsx — Кузница предметов (прототип P, 2026-10-19).
// Плитки выбора типа — по образцу окна категорий крафта (CraftingModal).
import React, { useMemo, useRef, useState } from 'react';
import { C, css } from './theme';
import { Field, TextInput, Panel } from './fields';
import { emptyWeapon, WeaponForm } from './WeaponForm';
import { emptyMod, emptyAmmo, ModForm, AmmoForm } from './ModAmmoForms';
import { buildPackFile, parsePackFile, downloadPackFile } from './pack';
import type { PackSession, SessionItem } from './pack';
import { refs, AUDIENCE_OPTIONS } from './catalogs';
import type { Option } from './catalogs';
import { validateContentPack } from './itempack/validate.js';

type Screen =
  | { view: 'home' }
  | { view: 'weapon' | 'mod' | 'ammo'; index: number | null; draft: SessionItem };

const emptySession = (): PackSession => ({
  manifest: { packId: 'my_pack', name: '', author: '', locale: 'ru-RU' },
  items: [],
});

const COLLECTION_LABEL: Record<string, string> = {
  weapons: 'Оружие', weaponMods: 'Мод', ammo: 'Патрон',
};

const OWN_PREFIX_KIND: Record<string, string> = {
  weapons: 'weapon_', weaponMods: 'mod_', ammo: 'ammo_',
};

export default function App() {
  const [session, setSession] = useState<PackSession>(emptySession);
  const [screen, setScreen] = useState<Screen>({ view: 'home' });
  const [validation, setValidation] = useState<{ ok: boolean; errors: { path: string; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const packId = session.manifest.packId;
  const otherLocale = session.manifest.locale === 'ru-RU' ? 'en-EN' : 'ru-RU';

  const ownWeapons: Option[] = session.items
    .filter((i) => i.collection === 'weapons')
    .map((i) => ({ id: `hb_${packId}_${i.data.id}`, label: i.namePrimary || i.data.id }));
  const ownAmmo: Option[] = session.items
    .filter((i) => i.collection === 'ammo')
    .map((i) => ({ id: `hb_${packId}_${i.data.id}`, label: i.namePrimary || i.data.id }));
  const ownModsBySlot: Record<string, Option[]> = {};
  for (const m of session.items.filter((i) => i.collection === 'weaponMods')) {
    (ownModsBySlot[m.data.slot] ??= []).push({ id: `hb_${packId}_${m.data.id}`, label: m.namePrimary || m.data.id });
  }

  const pack = useMemo(() => buildPackFile(session), [session]);

  const openEditor = (view: Screen extends { view: infer V } ? V : never, factory: () => SessionItem) => {
    setValidation(null);
    setScreen({ view, index: null, draft: factory() } as Screen);
  };

  const saveItem = () => {
    if (screen.view === 'home') return;
    const { index, draft } = screen;
    const items = [...session.items];
    if (index === null) items.push(draft);
    else items[index] = draft;
    setSession({ ...session, items });
    setScreen({ view: 'home' });
    setValidation(null);
  };

  const runValidation = () => {
    const result = validateContentPack(pack, refs);
    setValidation({ ok: result.ok, errors: result.errors });
    return result.ok;
  };

  const handleExport = () => {
    if (runValidation()) downloadPackFile(pack, packId);
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const restored = parsePackFile(parsed);
      if (!restored) {
        setValidation({ ok: false, errors: [{ path: '(файл)', message: 'это не пак контента (нет manifest.packId)' }] });
        return;
      }
      setSession(restored);
      setValidation({ ok: true, errors: [] });
    } catch (e) {
      setValidation({ ok: false, errors: [{ path: '(файл)', message: `не JSON: ${(e as Error).message}` }] });
    }
  };

  if (screen.view !== 'home') {
    const { draft } = screen;
    const title = COLLECTION_LABEL[draft.collection];
    const canSave = !!draft.data.id && !!draft.namePrimary;
    return (
      <div style={css.page}>
        <div style={{ ...css.row, marginBottom: 12 }}>
          <button style={css.btnGhost} onClick={() => setScreen({ view: 'home' })}>← назад</button>
          <h1 style={{ color: '#f0e68c', fontSize: 20, margin: 0 }}>{title}</h1>
          <div style={{ flex: 1 }} />
          <button style={{ ...css.btn, opacity: canSave ? 1 : 0.4 }} disabled={!canSave} onClick={saveItem}>Сохранить в пак</button>
        </div>
        {!canSave && <div style={{ color: C.danger, marginBottom: 10, fontSize: 13 }}>Заполните id и имя ({session.manifest.locale}) — без этого предмет не попадёт в пак.</div>}
        {screen.view === 'weapon' && <WeaponForm draft={draft} ownAmmo={ownAmmo} ownModsBySlot={ownModsBySlot} onChange={(d2) => setScreen({ ...screen, draft: d2 })} />}
        {screen.view === 'mod' && <ModForm draft={draft} ownWeapons={ownWeapons} onChange={(d2) => setScreen({ ...screen, draft: d2 })} />}
        {screen.view === 'ammo' && <AmmoForm draft={draft} onChange={(d2) => setScreen({ ...screen, draft: d2 })} />}
        <Panel title={`Имена (основная локаль: ${session.manifest.locale}; вторая ${otherLocale} — необязательна, без перевода в игре будет id)`}>
          <Field label={`Имя (${session.manifest.locale}) *`}>
            <TextInput value={draft.namePrimary} onChange={(v) => setScreen({ ...screen, draft: { ...draft, namePrimary: v } })} />
          </Field>
          <Field label="Описание">
            <TextInput value={draft.descriptionPrimary} onChange={(v) => setScreen({ ...screen, draft: { ...draft, descriptionPrimary: v } })} />
          </Field>
          <Field label={`Имя (${otherLocale}, необязательно)`}>
            <TextInput value={draft.nameOther} onChange={(v) => setScreen({ ...screen, draft: { ...draft, nameOther: v } })} />
          </Field>
          <Field label={`Описание (${otherLocale}, необязательно)`}>
            <TextInput value={draft.descriptionOther} onChange={(v) => setScreen({ ...screen, draft: { ...draft, descriptionOther: v } })} />
          </Field>
        </Panel>
      </div>
    );
  }

  return (
    <div style={css.page}>
      <h1 style={{ color: '#f0e68c', fontSize: 22, margin: '0 0 4px' }}>Кузница предметов</h1>
      <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>
        Генератор паков контента для приложения «Positronium» (прототип: оружие, моды, патроны)
      </div>

      <Panel title="Пак">
        <div style={{ ...css.row, gap: 12 }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <Field label="packId (латиница)"><TextInput value={session.manifest.packId} onChange={(v) => setSession({ ...session, manifest: { ...session.manifest, packId: v.toLowerCase().replace(/[^a-z0-9_]/g, '_') } })} /></Field>
          </div>
          <div style={{ flex: 2, minWidth: 160 }}>
            <Field label="Название пака"><TextInput value={session.manifest.name} onChange={(v) => setSession({ ...session, manifest: { ...session.manifest, name: v } })} /></Field>
          </div>
          <div style={{ flex: 1.5, minWidth: 140 }}>
            <Field label="Автор"><TextInput value={session.manifest.author} onChange={(v) => setSession({ ...session, manifest: { ...session.manifest, author: v } })} /></Field>
          </div>
          <div>
            <Field label="Основная локаль">
              <select style={css.input} value={session.manifest.locale} onChange={(e) => setSession({ ...session, manifest: { ...session.manifest, locale: e.target.value as any } })}>
                <option value="ru-RU">ru-RU</option>
                <option value="en-EN">en-EN</option>
              </select>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Создать">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {([
            { icon: '🔫', label: 'Оружие', go: () => openEditor('weapon' as any, emptyWeapon) },
            { icon: '🔧', label: 'Мод оружия', go: () => openEditor('mod' as any, emptyMod) },
            { icon: '🥉', label: 'Патрон', go: () => openEditor('ammo' as any, emptyAmmo) },
          ]).map((t) => (
            <button key={t.label} type="button" style={css.tile} onClick={t.go}>
              <div style={{ fontSize: 28 }}>{t.icon}</div>
              <div style={{ color: '#f0e68c', fontWeight: 700, marginTop: 6 }}>{t.label}</div>
            </button>
          ))}
          {['Броня', 'Одежда', 'Происхождение'].map((label) => (
            <button key={label} type="button" style={{ ...css.tile, ...css.tileLocked }} disabled>
              <div style={{ fontSize: 28 }}>🔒</div>
              <div style={{ color: C.textDim, fontWeight: 700, marginTop: 6 }}>{label}</div>
              <div style={{ color: C.borderDim, fontSize: 11 }}>в следующих этапах</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={`Предметы пакета (${session.items.length})`}>
        {session.items.length === 0 && <div style={{ color: C.textDim }}>Пока пусто — выберите тип выше.</div>}
        {session.items.map((item, i) => (
          <div key={i} style={{ ...css.row, borderTop: i ? `1px solid ${C.borderDim}` : undefined, paddingTop: i ? 8 : 0, marginTop: i ? 8 : 0 }}>
            <span style={{ color: C.textDim, fontSize: 12, width: 56 }}>{COLLECTION_LABEL[item.collection]}</span>
            <span style={{ color: '#f0e68c', fontWeight: 600 }}>{item.namePrimary || '(без имени)'}</span>
            <span style={{ color: C.borderDim, fontSize: 12 }}>hb_{packId}_{item.data.id}</span>
            <div style={{ flex: 1 }} />
            <button style={css.btnGhost} onClick={() => setScreen({ view: item.collection === 'weapons' ? 'weapon' : item.collection === 'weaponMods' ? 'mod' : 'ammo', index: i, draft: JSON.parse(JSON.stringify(item)) } as Screen)}>править</button>
            <button style={css.btnGhost} onClick={() => setSession({ ...session, items: session.items.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
      </Panel>

      <Panel title="Экспорт">
        <div style={{ ...css.row, marginBottom: 10 }}>
          <button style={css.btn} onClick={handleExport}>Экспорт (скачать пак)</button>
          <button style={css.btnGhost} onClick={runValidation}>Проверить пак</button>
          <button style={css.btnGhost} onClick={() => fileRef.current?.click()}>Импорт для правки…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.target.value = ''; }}
          />
        </div>
        {validation && validation.ok && (
          <div style={{ color: C.ok, fontSize: 13 }}>
            Пак валиден: оружия {pack.items.weapons?.length ?? 0}, модов {pack.items.weaponMods?.length ?? 0}, патронов {pack.items.ammo?.length ?? 0}.
            Файл загружается в приложении: окно «Игровой сеттинг» → «Паки контента» → «Загрузить пак контента».
          </div>
        )}
        {validation && !validation.ok && (
          <div>
            <div style={{ color: C.danger, fontWeight: 700, marginBottom: 6 }}>Пак не пройдёт валидацию в приложении ({validation.errors.length}):</div>
            {validation.errors.slice(0, 10).map((e, i) => (
              <div key={i} style={{ color: C.danger, fontSize: 12 }}>{e.path}: {e.message}</div>
            ))}
            {validation.errors.length > 10 && <div style={{ color: C.danger, fontSize: 12 }}>…и ещё {validation.errors.length - 10}</div>}
          </div>
        )}
      </Panel>
    </div>
  );
}
