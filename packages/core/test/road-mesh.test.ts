import { describe, expect, it } from "vitest";
import {
  keepSpacedAxes,
  MIN_STREET_GAP,
  openAvenueGaps,
  paintClass,
  pruneInternalDeadEnds,
  stitchAvenueJunctions,
  trimStraightAvenueWidth,
  widenAvenueCorridors,
} from "../src/road-mesh.js";
import { pairLaneMates, type RoadClass } from "../src/road-tiles.js";

describe("M3.6.1 local mesh spacing", () => {
  it("drops warped axes that would leave a manzana thinner than sidewalk+lot+sidewalk", () => {
    expect(MIN_STREET_GAP).toBe(4);
    expect(keepSpacedAxes([10, 12, 20], [])).toEqual([10, 20]);
    expect(keepSpacedAxes([8, 16, 24], [16])).toEqual([8, 24]);
  });
});

describe("GEN-028 avenue widening", () => {
  it("paints a perpendicular twin for a north-south arterial and pairs the lanes", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) paintClass(classes, [5, y], "arterial");
    widenAvenueCorridors(classes, 16);
    for (let y = 2; y <= 8; y += 1) {
      expect(classes.get(`6,${y}`) ?? classes.get(`4,${y}`)).toBe("arterial");
    }
    const mates = pairLaneMates(classes);
    expect(mates.get("5,5") === "6,5" || mates.get("5,5") === "4,5").toBe(true);
  });

  it("pairs two adjacent 1-cell centerlines instead of dilating into a 3-cell slab", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) {
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [6, y], "arterial");
    }
    widenAvenueCorridors(classes, 16);
    for (let y = 2; y <= 8; y += 1) {
      const row = [4, 5, 6, 7].filter((x) => classes.has(`${x},${y}`));
      expect(row).toEqual([5, 6]);
    }
    expect(pairLaneMates(classes).get("5,5")).toBe("6,5");
  });

  it("does not fill a 1-cell gap between parallel centerlines into a 3-wide run", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) {
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [7, y], "arterial");
    }
    widenAvenueCorridors(classes, 16);
    for (let y = 3; y <= 7; y += 1) {
      const xs = [4, 5, 6, 7, 8]
        .filter((x) => classes.has(`${x},${y}`))
        .sort((left, right) => left - right);
      expect(xs.length).toBeGreaterThan(0);
      for (let index = 0; index < xs.length - 2; index += 1) {
        const first = xs[index];
        const second = xs[index + 1];
        const third = xs[index + 2];
        if (first === undefined || second === undefined || third === undefined) continue;
        expect(second === first + 1 && third === first + 2).toBe(false);
      }
    }
  });

  it("collapses three parallel centerlines into one 2-cell avenue", () => {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6, 7]) {
      for (let y = 2; y <= 10; y += 1) paintClass(classes, [x, y], "arterial");
    }
    widenAvenueCorridors(classes, 16);
    for (let y = 3; y <= 9; y += 1) {
      expect([4, 5, 6, 7, 8].filter((x) => classes.has(`${x},${y}`))).toEqual([5, 6]);
    }
    expect(pairLaneMates(classes).get("5,6")).toBe("6,6");
  });

  it("keeps a perpendicular avenue connected when collapsing a 3-cell slab", () => {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6, 7]) {
      for (let y = 2; y <= 10; y += 1) paintClass(classes, [x, y], "arterial");
    }
    for (let x = 3; x <= 12; x += 1) paintClass(classes, [x, 6], "collector");
    widenAvenueCorridors(classes, 16);
    const xs = [...classes.keys()]
      .filter((key) => key.split(",")[1] === "6")
      .map((key) => Number(key.split(",")[0]))
      .sort((left, right) => left - right);
    expect(xs[0]).toBeLessThanOrEqual(3);
    expect(xs[xs.length - 1]).toBeGreaterThanOrEqual(12);
    for (let index = 1; index < xs.length; index += 1) {
      const previous = xs[index - 1];
      const current = xs[index];
      if (previous === undefined || current === undefined) continue;
      expect(current - previous).toBe(1);
    }
  });

  it("trims a 3-cell north-south slab back to two cells", () => {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6, 7]) {
      for (let y = 2; y <= 8; y += 1) paintClass(classes, [x, y], "arterial");
    }
    trimStraightAvenueWidth(classes, 16);
    for (let y = 3; y <= 7; y += 1) {
      expect([5, 6, 7].filter((x) => classes.has(`${x},${y}`))).toEqual([5, 6]);
    }
  });

  it("does not prune the outer curb of a 2-cell elbow", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 6; y += 1) {
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [6, y], "arterial");
    }
    for (let x = 5; x <= 10; x += 1) {
      paintClass(classes, [x, 6], "arterial");
      paintClass(classes, [x, 7], "arterial");
    }
    pruneInternalDeadEnds(classes, new Set(["5,2", "6,2", "10,6", "10,7"]));
    expect(classes.has("5,2")).toBe(true);
    expect(classes.has("6,2")).toBe(true);
    expect(classes.has("5,6")).toBe(true);
    expect(classes.has("6,6")).toBe(true);
    expect(classes.has("10,6")).toBe(true);
    expect(classes.has("10,7")).toBe(true);
  });
});

describe("GEN-028 avenue junction stitch", () => {
  it("fills a 1-cell gap between a dual stem and a dual bar", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) {
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [6, y], "arterial");
    }
    for (let x = 4; x <= 12; x += 1) {
      paintClass(classes, [x, 10], "arterial");
      paintClass(classes, [x, 11], "arterial");
    }
    stitchAvenueJunctions(classes, 16);
    expect(classes.get("5,9")).toBe("arterial");
    expect(classes.get("6,9")).toBe("arterial");
    expect(openAvenueGaps(classes, 16)).toEqual([]);
  });

  it("does not fill the median between two parallel dual carriageways", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) {
      paintClass(classes, [4, y], "arterial");
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [7, y], "arterial");
      paintClass(classes, [8, y], "arterial");
    }
    stitchAvenueJunctions(classes, 16);
    for (let y = 3; y <= 7; y += 1) {
      expect(classes.has(`6,${y}`)).toBe(false);
    }
  });

  it("does not fill the interior lot of a connected dual L", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 6; y += 1) {
      paintClass(classes, [5, y], "arterial");
      paintClass(classes, [6, y], "arterial");
    }
    for (let x = 5; x <= 10; x += 1) {
      paintClass(classes, [x, 6], "arterial");
      paintClass(classes, [x, 7], "arterial");
    }
    stitchAvenueJunctions(classes, 16);
    expect(classes.has("7,5")).toBe(false);
    expect(classes.has("8,5")).toBe(false);
    expect(classes.has("7,4")).toBe(false);
  });
});
