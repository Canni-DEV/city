import { describe, expect, it } from "vitest";
import {
  occupiedCellsForRoadTile,
  resolveUnitTile,
  rotateConnector,
  rotateConnectors,
  tileMatchesNeighbors,
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

  it("selects road-bend and road-curve yaw from east+south identity", () => {
    expect(yawForConnectors(["east", "south"], ["east", "south"])).toBe(0);
    expect(yawForConnectors(["east", "south"], ["south", "west"])).toBe(90);
    expect(yawForConnectors(["east", "south"], ["west", "north"])).toBe(180);
    expect(yawForConnectors(["east", "south"], ["north", "east"])).toBe(270);
  });

  it("selects straight and end yaw from Kenney east-west identity", () => {
    expect(yawForConnectors(["east", "west"], ["east", "west"])).toBe(0);
    expect(yawForConnectors(["east", "west"], ["north", "south"])).toBe(90);
    expect(yawForConnectors(["east"], ["north"])).toBe(270);
  });

  it("rotates Kenney meshes so sidewalks stay on the sides of a run", () => {
    expect(resolveUnitTile(["east", "west"], "local", false)).toEqual({
      assetId: "roads:road-straight",
      rotation: 0,
    });
    expect(resolveUnitTile(["north", "south"], "local", false)).toEqual({
      assetId: "roads:road-straight",
      rotation: 90,
    });
    expect(resolveUnitTile(["north", "south"], "arterial", false)).toEqual({
      assetId: "roads:road-straight",
      rotation: 90,
    });
    expect(resolveUnitTile(["east", "west"], "collector", false)).toEqual({
      assetId: "roads:road-straight",
      rotation: 0,
    });
    expect(resolveUnitTile(["north"], "local", false)).toEqual({
      assetId: "roads:road-end",
      rotation: 270,
    });
    expect(resolveUnitTile(["north", "east", "south"], "local", false)).toEqual({
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
    const occupied = new Set(["4,4", "4,5", "5,4", "5,5", "6,4", "5,6"]);
    expect(tileMatchesNeighbors(tile, occupied)).toBe(true);
  });
});
