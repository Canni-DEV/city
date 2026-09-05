import { describe, expect, it } from "vitest";
import {
  occupiedCellsForRoadTile,
  resolveUnitTile,
  rotateConnector,
  rotateConnectors,
  tileMatchesNeighbors,
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
      assetId: "roads:road-intersection",
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
});
