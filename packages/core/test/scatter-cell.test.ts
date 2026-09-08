import { describe, expect, it } from "vitest";
import { SeededRandom } from "../src/rng.js";
import {
  aabbFor,
  aabbInsideCell,
  clusterCount,
  freeYaw,
  OCCUPANT_INSET,
  occupantJitter,
  type ScatterAabb,
  scatterRadius,
  tryScatterPoint,
} from "../src/scatter-cell.js";

const cell = [4, 7] as const;
const tree = { width: 0.3391, depth: 0.2936 };
const flower = { width: 0.0715, depth: 0.0813 };

function occupancyOrigin(position: readonly [number, number]): [number, number] {
  return [Math.round(position[0] - 0.5), Math.round(position[1] - 0.5)];
}

describe("scatter-cell", () => {
  it("keeps occupant jitter AABB and occupancy inside the cell", () => {
    const random = new SeededRandom("jitter-inset");
    for (let index = 0; index < 40; index += 1) {
      const position = occupantJitter([...cell], tree, random);
      const aabb = aabbFor(position, tree);
      expect(aabbInsideCell(aabb, [...cell])).toBe(true);
      expect(occupancyOrigin(position)).toEqual([cell[0], cell[1]]);
      expect(position[0]).toBeGreaterThan(cell[0] + OCCUPANT_INSET);
      expect(position[0]).toBeLessThan(cell[0] + 1 - OCCUPANT_INSET);
    }
  });

  it("rejects darts that overlap an occupying AABB", () => {
    const occupant: ScatterAabb = {
      minX: cell[0],
      maxX: cell[0] + 1,
      minZ: cell[1],
      maxZ: cell[1] + 1,
    };
    const random = new SeededRandom("blocked-occupant");
    expect(tryScatterPoint([...cell], flower, random, [occupant], [])).toBeUndefined();
  });

  it("keeps clustered samples separated and inside the cell", () => {
    const random = new SeededRandom("cluster-sep");
    const placed: { position: [number, number]; radius: number }[] = [];
    for (let index = 0; index < 4; index += 1) {
      const position = tryScatterPoint([...cell], flower, random, [], placed);
      expect(position).toBeDefined();
      if (!position) continue;
      expect(aabbInsideCell(aabbFor(position, flower), [...cell])).toBe(true);
      placed.push({ position, radius: scatterRadius(flower) });
    }
    expect(placed).toHaveLength(4);
  });

  it("is deterministic for the same seed and diverges otherwise", () => {
    const first = occupantJitter([...cell], tree, new SeededRandom("same-seed"));
    const second = occupantJitter([...cell], tree, new SeededRandom("same-seed"));
    const other = occupantJitter([...cell], tree, new SeededRandom("other-seed"));
    expect(first).toEqual(second);
    expect(first).not.toEqual(other);
    expect(freeYaw(new SeededRandom("yaw-a"))).toBe(freeYaw(new SeededRandom("yaw-a")));
    expect(freeYaw(new SeededRandom("yaw-a"))).not.toBe(freeYaw(new SeededRandom("yaw-b")));
    expect(freeYaw(new SeededRandom("yaw-a"))).toBeGreaterThanOrEqual(0);
    expect(freeYaw(new SeededRandom("yaw-a"))).toBeLessThan(360);
  });

  it("caps cluster count between 1 and 4", () => {
    expect(clusterCount(0)).toBe(1);
    expect(clusterCount(50)).toBe(2);
    expect(clusterCount(100)).toBe(3);
    expect(clusterCount(999)).toBe(4);
  });
});
