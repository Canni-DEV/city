export function deriveProceduralId(...parts: readonly (string | number)[]): string {
  const input = parts.join(":");
  let hash = 0x811c9dc5;
  for (const character of input) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `proc_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createUserEntityId(uuidFactory: () => string = () => crypto.randomUUID()): string {
  return `user_${uuidFactory()}`;
}
