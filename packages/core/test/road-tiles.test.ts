import { describe, expect, it } from "vitest";
import { paintClass, stitchAvenueJunctions, widenAvenueCorridors } from "../src/road-mesh.js";
import {
  logicalConnections,
  occupiedCellsForRoadTile,
  pairLaneMates,
  type RoadClass,
  resolveRoadTiles,
  resolveUnitTile,
  rotateConnector,
  rotateConnectors,
  tileMatchesNeighbors,
  tryArterialCurve,
  tryArterialRoundabout,
  yawForConnectors,
} from "../src/road-tiles.js";

describe("GEN-005 connector yaw", () => {
  it("rotates catalog connectors clockwise with stored yaw", () => {
    expect(rotateConnector("east", 90)).toBe("south");
    expect(rotateConnector("south", 90)).toBe("west");
    expect(rotateConnectors(["east", "south"], 0)).toEqual(["east", "south"]);
    expect(rotateConnectors(["east", "south"], 90).sort()).toEqual(["south", "west"]);
    expect(rotateConnectors(["east", "south"], 180).sort()).toEqual(["north", "west"]);
    expect(rotateConnectors(["east", "south"], 270).sort()).toEqual(["east", "north"]);
  });

  it("selects road-bend and road-curve yaw from west+south identity", () => {
    expect(yawForConnectors(["west", "south"], ["west", "south"])).toBe(0);
    expect(yawForConnectors(["west", "south"], ["north", "west"])).toBe(90);
    expect(yawForConnectors(["west", "south"], ["north", "east"])).toBe(180);
    expect(yawForConnectors(["west", "south"], ["east", "south"])).toBe(270);
  });

  it("selects straight and end yaw from Kenney east-west identity", () => {
    expect(yawForConnectors(["east", "west"], ["east", "west"])).toBe(0);
    expect(yawForConnectors(["east", "west"], ["north", "south"])).toBe(90);
    expect(yawForConnectors(["east"], ["north"])).toBe(270);
  });

  it("rotates Kenney meshes so sidewalks stay on the sides of a run", () => {
    expect(resolveUnitTile(["east", "west"], "local")).toEqual({
      assetId: "roads:road-straight",
      rotation: 0,
    });
    expect(resolveUnitTile(["north", "south"], "local")).toEqual({
      assetId: "roads:road-straight",
      rotation: 90,
    });
    expect(resolveUnitTile(["north", "south"], "arterial")).toEqual({
      assetId: "roads:road-straight",
      rotation: 90,
    });
    expect(resolveUnitTile(["east", "west"], "collector")).toEqual({
      assetId: "roads:road-straight",
      rotation: 0,
    });
    expect(resolveUnitTile(["north"], "local")).toEqual({
      assetId: "roads:road-end",
      rotation: 270,
    });
    expect(resolveUnitTile(["north", "east", "south"], "local")).toEqual({
      assetId: "roads:road-intersection-path",
      rotation: 270,
    });
    expect(resolveUnitTile(["west", "south"], "local")).toEqual({
      assetId: "roads:road-bend",
      rotation: 0,
    });
    expect(resolveUnitTile(["east", "south"], "local")).toEqual({
      assetId: "roads:road-bend",
      rotation: 270,
    });
    expect(resolveUnitTile(["west", "south"], "arterial")).toEqual({
      assetId: "roads:road-bend-sidewalk",
      rotation: 0,
    });
    expect(resolveUnitTile(["north", "east", "south", "west"], "arterial")).toEqual({
      assetId: "roads:road-crossroad",
      rotation: 0,
    });
    expect(resolveUnitTile(["north", "east", "south"], "arterial")).toEqual({
      assetId: "roads:road-intersection",
      rotation: 270,
    });
  });

  it("occupies four cells for a 2x2 curve and matches external connectors", () => {
    const tile = { position: [4, 4] as [number, number], assetId: "roads:road-curve", rotation: 0 };
    expect(occupiedCellsForRoadTile(tile)).toEqual([
      [4, 4],
      [4, 5],
      [5, 4],
      [5, 5],
    ]);
    const occupied = new Set(["4,4", "4,5", "5,4", "5,5", "3,4", "5,6"]);
    expect(tileMatchesNeighbors(tile, occupied)).toBe(true);
  });

  it("places a 3x3 Kenney roundabout on a clear arterial plus", () => {
    const occupied = new Set(["5,5", "5,4", "5,3", "6,5", "7,5", "5,6", "5,7", "4,5", "3,5"]);
    const mask = Array.from({ length: 12 * 12 }, () => true);
    const placed = tryArterialRoundabout([5, 5], occupied, 12, new Set(), mask);
    expect(placed).toEqual({ origin: [4, 4] });
    const tile = {
      position: [4, 4] as [number, number],
      assetId: "roads:road-roundabout",
      rotation: 0,
    };
    expect(occupiedCellsForRoadTile(tile)).toHaveLength(9);
    const expanded = new Set(occupied);
    for (const cell of occupiedCellsForRoadTile(tile)) expanded.add(`${cell[0]},${cell[1]}`);
    expect(tileMatchesNeighbors(tile, expanded)).toBe(true);
    expect(tryArterialRoundabout([5, 5], occupied, 12, new Set(["4,4"]), mask)).toBeUndefined();
  });

  it("requires T and 4-way meshes to match neighbor arity", () => {
    const tee = {
      position: [5, 5] as [number, number],
      assetId: "roads:road-intersection",
      rotation: 0,
    };
    const occupied = new Set(["5,5", "4,5", "6,5", "5,6"]);
    expect(tileMatchesNeighbors(tee, occupied)).toBe(true);
    expect(
      tileMatchesNeighbors({ ...tee, assetId: "roads:road-straight", rotation: 0 }, occupied),
    ).toBe(false);
  });
});

describe("GEN-028 two-cell avenue topology", () => {
  const mask = Array.from({ length: 16 * 16 }, () => true);

  function nsAvenue(): Map<string, RoadClass> {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6]) {
      for (const y of [3, 4, 5, 6, 7]) classes.set(`${x},${y}`, "arterial");
    }
    return classes;
  }

  it("pairs a dual carriageway and ignores the twin as a street", () => {
    const classes = nsAvenue();
    const mates = pairLaneMates(classes);
    expect(mates.get("5,5")).toBe("6,5");
    expect(mates.get("6,5")).toBe("5,5");
    const occupied = new Set(classes.keys());
    expect(logicalConnections([5, 5], occupied, mates).sort()).toEqual(["north", "south"]);
  });

  it("resolves a 2-cell through-run to road-straight, not intersection", () => {
    const tiles = resolveRoadTiles(nsAvenue(), 16, "seed", 0, mask);
    const mid = tiles.filter((tile) => tile.position[1] >= 4 && tile.position[1] <= 6);
    expect(mid.every((tile) => tile.assetId === "roads:road-straight")).toBe(true);
    expect(tiles.some((tile) => tile.assetId === "roads:road-intersection")).toBe(false);
    const occupied = new Set(nsAvenue().keys());
    const mates = pairLaneMates(nsAvenue());
    for (const tile of tiles) {
      expect(tileMatchesNeighbors(tile, occupied, mates)).toBe(true);
    }
  });

  it("keeps a one-sided local T on one lane and straight on the twin", () => {
    const classes = nsAvenue();
    classes.set("4,5", "local");
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const at = (x: number, y: number) =>
      tiles.find((tile) => tile.position[0] === x && tile.position[1] === y);
    expect(at(5, 5)?.assetId).toBe("roads:road-intersection");
    expect(at(6, 5)?.assetId).toBe("roads:road-straight");
  });

  it("see-through makes a through-local a 4-way on both lanes", () => {
    const classes = nsAvenue();
    classes.set("4,5", "local");
    classes.set("7,5", "local");
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const at = (x: number, y: number) =>
      tiles.find((tile) => tile.position[0] === x && tile.position[1] === y);
    expect(at(5, 5)?.assetId).toBe("roads:road-crossroad");
    expect(at(6, 5)?.assetId).toBe("roads:road-crossroad");
  });

  it("does not place a 2x2 curve on a 2-cell-wide elbow", () => {
    const occupied = new Set([
      "4,4",
      "4,5",
      "4,6",
      "5,4",
      "5,5",
      "5,6",
      "6,6",
      "7,6",
      "6,7",
      "7,7",
    ]);
    expect(tryArterialCurve([4, 6], occupied, 16, new Set())).toBeUndefined();
  });

  it("resolves a collapsed 3-cell slab to road-straight, not a ladder of intersections", () => {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6, 7]) {
      for (let y = 2; y <= 10; y += 1) paintClass(classes, [x, y], "arterial");
    }
    widenAvenueCorridors(classes, 16);
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const mid = tiles.filter((tile) => tile.position[1] >= 4 && tile.position[1] <= 8);
    expect(mid.length).toBeGreaterThan(0);
    expect(mid.every((tile) => tile.assetId === "roads:road-straight")).toBe(true);
    expect(
      tiles.some(
        (tile) =>
          tile.assetId === "roads:road-intersection" || tile.assetId === "roads:road-crossroad",
      ),
    ).toBe(false);
  });

  it("counts the lane-mate as a connector on a dual elbow", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 3; y <= 6; y += 1) {
      classes.set(`5,${y}`, "arterial");
      classes.set(`6,${y}`, "arterial");
    }
    for (let x = 5; x <= 9; x += 1) {
      classes.set(`${x},6`, "arterial");
      classes.set(`${x},7`, "arterial");
    }
    const mates = pairLaneMates(classes);
    const occupied = new Set(classes.keys());
    expect(logicalConnections([5, 7], occupied, mates).sort()).toEqual(["east", "north"]);
  });

  it("resolves a dual 4-way 2x2 to road-crossroad without a grass hole", () => {
    const classes = new Map<string, RoadClass>();
    for (const x of [5, 6]) {
      for (let y = 2; y <= 10; y += 1) classes.set(`${x},${y}`, "arterial");
    }
    for (const y of [5, 6]) {
      for (let x = 2; x <= 10; x += 1) classes.set(`${x},${y}`, "arterial");
    }
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const at = (x: number, y: number) =>
      tiles.find((tile) => tile.position[0] === x && tile.position[1] === y);
    for (const x of [5, 6]) {
      for (const y of [5, 6]) {
        expect(at(x, y)?.assetId).toBe("roads:road-crossroad");
      }
    }
    const occupied = new Set(classes.keys());
    const mates = pairLaneMates(classes);
    for (const tile of tiles) {
      expect(tileMatchesNeighbors(tile, occupied, mates)).toBe(true);
    }
  });

  it("fills a dual T gap and does not leave an internal road-end", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 2; y <= 8; y += 1) {
      classes.set(`5,${y}`, "arterial");
      classes.set(`6,${y}`, "arterial");
    }
    for (let x = 4; x <= 12; x += 1) {
      classes.set(`${x},10`, "arterial");
      classes.set(`${x},11`, "arterial");
    }
    widenAvenueCorridors(classes, 16);
    stitchAvenueJunctions(classes, 16);
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const at = (x: number, y: number) =>
      tiles.find((tile) => tile.position[0] === x && tile.position[1] === y);
    expect(at(5, 9)?.assetId).not.toBe("roads:road-end");
    expect(at(6, 9)?.assetId).not.toBe("roads:road-end");
    expect(at(5, 8)?.assetId).not.toBe("roads:road-end");
    expect(at(6, 8)?.assetId).not.toBe("roads:road-end");
  });

  it("resolves a dual L without road-end caps in the 2x2 corner", () => {
    const classes = new Map<string, RoadClass>();
    for (let y = 3; y <= 6; y += 1) {
      classes.set(`5,${y}`, "arterial");
      classes.set(`6,${y}`, "arterial");
    }
    for (let x = 5; x <= 9; x += 1) {
      classes.set(`${x},6`, "arterial");
      classes.set(`${x},7`, "arterial");
    }
    const tiles = resolveRoadTiles(classes, 16, "seed", 0, mask);
    const corner = tiles.filter(
      (tile) =>
        tile.position[0] >= 5 &&
        tile.position[0] <= 6 &&
        tile.position[1] >= 6 &&
        tile.position[1] <= 7,
    );
    expect(corner.length).toBe(4);
    expect(corner.some((tile) => tile.assetId === "roads:road-end")).toBe(false);
    expect(corner.some((tile) => tile.assetId === "roads:road-curve")).toBe(false);
    const occupied = new Set(classes.keys());
    const mates = pairLaneMates(classes);
    for (const tile of tiles) {
      expect(tileMatchesNeighbors(tile, occupied, mates)).toBe(true);
    }
  });
});
