// Generic recursive object merge. Arrays and primitive values are replaced.
export function deepMerge(base, override) {
  if (override === undefined || override === null) return base;
  if (base === null || base === undefined) return override;

  const isPlainObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const out = { ...base };
  for (const key of Object.keys(override)) {
    const baseValue = out[key];
    const overrideValue = override[key];
    out[key] = isPlainObject(baseValue) && isPlainObject(overrideValue)
      ? deepMerge(baseValue, overrideValue)
      : overrideValue;
  }
  return out;
}
