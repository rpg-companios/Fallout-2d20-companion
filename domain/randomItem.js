/** Select one validated entry from a collection with a uniform random draw. */
export function pickRandomItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('[randomItem] Cannot pick from an empty collection');
  }
  const picked = items[Math.floor(Math.random() * items.length)];
  if (!picked || typeof picked.name !== 'string' || picked.name.length === 0) {
    throw new Error('[randomItem] Randomly selected item must have a name');
  }
  return picked;
}
