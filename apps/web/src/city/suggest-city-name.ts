const PREFIXES = [
  "Green",
  "Harbor",
  "Cedar",
  "Iron",
  "Silver",
  "Willow",
  "North",
  "Bright",
  "Stone",
  "Maple",
  "River",
  "Golden",
] as const;
const SUFFIXES = [
  "Crossroads",
  "Quay",
  "Heights",
  "Commons",
  "Yards",
  "Terrace",
  "Meadows",
  "Harbor",
  "Point",
  "Ridge",
] as const;

/** FUN-011: derive a short editable name from any seed-like source. */
export function suggestCityName(source: string = crypto.randomUUID()): string {
  let hash = 0x811c9dc5;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  const value = hash >>> 0;
  return `${PREFIXES[value % PREFIXES.length]} ${SUFFIXES[Math.floor(value / PREFIXES.length) % SUFFIXES.length]}`;
}
