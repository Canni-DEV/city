export type GridPoint = readonly [number, number];

export function cellKey([x, y]: GridPoint): string {
  return `${x},${y}`;
}

/** GEN-009: integer-cell occupancy used by placement and overlap checks. */
export class SpatialHash {
  readonly #owners = new Map<string, string>();

  get size(): number {
    return this.#owners.size;
  }

  has(cell: GridPoint): boolean {
    return this.#owners.has(cellKey(cell));
  }

  owner(cell: GridPoint): string | undefined {
    return this.#owners.get(cellKey(cell));
  }

  occupy(cells: readonly GridPoint[], owner: string): boolean {
    for (const cell of cells) {
      if (this.#owners.has(cellKey(cell))) return false;
    }
    for (const cell of cells) this.#owners.set(cellKey(cell), owner);
    return true;
  }
}
