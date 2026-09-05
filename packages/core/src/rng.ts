import { xoroshiro128plus } from "pure-rand/generator/xoroshiro128plus";

export function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

export class SeededRandom {
  readonly #generator;

  constructor(seed: string) {
    this.#generator = xoroshiro128plus(hashText(seed));
  }

  float(): number {
    return (this.#generator.next() >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.float() * (maximum - minimum + 1));
  }
}
