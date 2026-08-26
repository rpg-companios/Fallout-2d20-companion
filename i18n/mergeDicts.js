// Словарь движка + словарь активного сеттинга.
// Сеттинг перекрывает те же ключи (например «атрибуты» → «параметры»).
// Нет ключа ни там, ни там — ошибка, не путь-заглушка.

export function deepMerge(base, overlay) {
  if (overlay === undefined) return base;
  if (
    overlay === null
    || typeof overlay !== 'object'
    || Array.isArray(overlay)
    || base === null
    || typeof base !== 'object'
    || Array.isArray(base)
  ) {
    return overlay;
  }
  const next = { ...base };
  Object.entries(overlay).forEach(([key, value]) => {
    next[key] = Object.hasOwn(next, key) ? deepMerge(next[key], value) : value;
  });
  return next;
}

export function lookupDict(dict, path, label) {
  let current = dict;
  for (const part of String(path).split('.')) {
    current = current?.[part];
    if (current === undefined) {
      throw new Error(`[${label}] Нет ключа "${path}"`);
    }
  }
  return current;
}
