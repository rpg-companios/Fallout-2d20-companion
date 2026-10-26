// item-forge/src/fields.tsx — мелкие примитивы формы (тёмная тема приложения).
import React, { useState } from 'react';
import { C, css } from './theme';
import type { Option } from './catalogs';

export const Field = ({ label, children, hint }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: 10 }}>
    <label style={css.label}>{label}{hint ? <span style={{ color: C.borderDim }}> — {hint}</span> : null}</label>
    {children}
  </div>
);

export const TextInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <input style={css.input} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);

export const NumInput = ({ value, onChange, step }: { value: number | ''; onChange: (v: number | '') => void; step?: string }) => (
  <input
    style={css.input}
    type="number"
    step={step ?? '1'}
    value={value === '' ? '' : value}
    onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
  />
);

export const Select = ({ value, onChange, options, allowEmpty, filterable }: {
  value: string; onChange: (v: string) => void; options: Option[]; allowEmpty?: string; filterable?: boolean;
}) => {
  const [filter, setFilter] = useState('');
  const shown = filterable && filter ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()) || o.id.includes(filter)) : options;
  return (
    <div>
      {filterable && <TextInput value={filter} onChange={setFilter} placeholder="фильтр…" />}
      <select
        style={{ ...css.input, marginTop: filterable ? 6 : 0 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty !== undefined && <option value="">{allowEmpty}</option>}
        {shown.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
};

export const Chips = ({ options, selected, onToggle }: { options: Option[]; selected: string[]; onToggle: (id: string) => void }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
    {options.map((o) => (
      <button key={o.id} type="button" style={css.chip(selected.includes(o.id))} onClick={() => onToggle(o.id)} title={o.id}>
        {o.label}
      </button>
    ))}
  </div>
);

export const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={css.panel}>
    <div style={css.panelTitle}>{title}</div>
    {children}
  </div>
);

export const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
