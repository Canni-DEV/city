import { describe, expect, it } from "vitest";
import {
  type AgentRuntimeState,
  agentCountFor,
  clipForAgent,
  createGridWalkPolicy,
  createRoadWalkPolicy,
  DEFAULT_AGENT_SPEED,
  findPath,
  generateRoadCity,
  hashGeneratedStructure,
  PRESET_PARAMETERS,
  reservationMap,
  type SeededRandom,
  spawnAgents,
  tickAgents,
} from "../src/index.js";
import { TEST_ASSETS } from "./catalog-assets.js";

const timestamp = "2026-09-05T12:00:00.000Z";

function tile(x: number, y: number) {
  return { position: [x, y] as [number, number], assetId: "roads:road-straight", rotation: 0 };
}

function standingAgent(
  index: number,
  cell: [number, number],
  extras: Partial<AgentRuntimeState> = {},
): AgentRuntimeState {
  return {
    id: `agent:${index}`,
    index,
    cell,
    nextCell: null,
    progress: 0,
    heading: 0,
    path: [],
    destination: [...cell],
    destCount: 1,
    waitSeconds: 0,
    moving: false,
    skin: "skaterMaleA",
    clip: "idle",
    ...extras,
  };
}

describe("TST-008 runtime agents", () => {
  it("builds a 4-connected walk graph from occupied road cells", () => {
    const tiles = [tile(2, 2), tile(3, 2), tile(3, 3)];
    const policy = createRoadWalkPolicy(tiles);
    expect(policy.kind).toBe("road-graph");
    expect(policy.isWalkable([2, 2])).toBe(true);
    expect(policy.isWalkable([3, 2])).toBe(true);
    expect(policy.isWalkable([3, 3])).toBe(true);
    expect(policy.isWalkable([2, 3])).toBe(false);
    expect(policy.neighbors([3, 2]).sort()).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });

  it("finds A* paths on the walk policy", () => {
    const walkable = new Set(["0,0", "1,0", "2,0", "2,1", "2,2"]);
    const policy = createGridWalkPolicy(walkable);
    expect(findPath(policy, [0, 0], [2, 2])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(findPath(policy, [0, 0], [1, 1])).toBeUndefined();
  });

  it("waits on a reserved cell then replans to another destination", () => {
    const base = createGridWalkPolicy(new Set(["0,0", "1,0", "0,1", "1,1"]));
    const policy = {
      ...base,
      sampleDestination(from: [number, number], rng: SeededRandom) {
        if (from[0] === 0 && from[1] === 0) return [0, 1] as [number, number];
        return base.sampleDestination(from, rng);
      },
    };

    const agents: AgentRuntimeState[] = [
      standingAgent(0, [0, 0], {
        destination: [1, 0],
        path: [[1, 0]],
        destCount: 1,
      }),
      standingAgent(1, [1, 0]),
    ];
    const blocked = tickAgents(agents, { policy, dt: 0.2, seed: "wait-seed", waitLimit: 0.5 });
    expect(blocked[0]?.moving).toBe(false);
    expect(blocked[0]?.clip).toBe("idle");
    expect(blocked[0]?.waitSeconds).toBeCloseTo(0.2);
    expect(blocked[0]?.cell).toEqual([0, 0]);

    let current = blocked;
    for (let step = 0; step < 3; step += 1) {
      current = tickAgents(current, { policy, dt: 0.2, seed: "wait-seed", waitLimit: 0.5 });
    }
    expect(current[0]?.waitSeconds).toBe(0);
    expect(current[0]?.destCount).toBeGreaterThan(1);
  });

  it("does not let two agents occupy or step into the same cell", () => {
    const policy = createGridWalkPolicy(new Set(["0,0", "1,0", "2,0"]));
    const agents: AgentRuntimeState[] = [
      standingAgent(0, [0, 0], {
        destination: [2, 0],
        path: [
          [1, 0],
          [2, 0],
        ],
      }),
      standingAgent(1, [2, 0], {
        destination: [0, 0],
        path: [
          [1, 0],
          [0, 0],
        ],
      }),
    ];
    const next = tickAgents(agents, { policy, dt: 0.1, seed: "meet-seed", speed: 1 });
    const reserved = reservationMap(next);
    expect(new Set(reserved.values()).size).toBe(next.length);
    expect(
      next.filter((agent) => agent.nextCell && agent.nextCell[0] === 1 && agent.nextCell[1] === 0),
    ).toHaveLength(1);
  });

  it("spawns deterministically from the document seed and agent index", () => {
    const tiles = [tile(0, 0), tile(1, 0), tile(2, 0), tile(3, 0), tile(4, 0), tile(5, 0)];
    const first = spawnAgents({ seed: "city-seed", tiles, count: 4 });
    const second = spawnAgents({ seed: "city-seed", tiles, count: 4 });
    const other = spawnAgents({ seed: "other-seed", tiles, count: 4 });
    expect(first).toEqual(second);
    expect(first.map((agent) => agent.cell)).not.toEqual(other.map((agent) => agent.cell));
    expect(new Set(first.map((agent) => `${agent.cell[0]},${agent.cell[1]}`)).size).toBe(4);
    expect(first.every((agent) => ["idle", "run"].includes(clipForAgent(agent)))).toBe(true);
  });

  it("selects idle while stopped and run while moving", () => {
    expect(clipForAgent({ moving: false })).toBe("idle");
    expect(clipForAgent({ moving: true })).toBe("run");
  });

  it("walks about one third of a cell per second by default", () => {
    expect(DEFAULT_AGENT_SPEED).toBeCloseTo(1.85 / 3);
    const policy = createGridWalkPolicy(new Set(["0,0", "1,0", "2,0", "3,0"]));
    const agents = [
      standingAgent(0, [0, 0], {
        destination: [3, 0],
        path: [
          [1, 0],
          [2, 0],
          [3, 0],
        ],
      }),
    ];
    const next = tickAgents(agents, { policy, dt: 1, seed: "speed-seed" });
    expect(next[0]?.cell).toEqual([0, 0]);
    expect(next[0]?.progress).toBeCloseTo(DEFAULT_AGENT_SPEED);
    expect(next[0]?.clip).toBe("run");
  });

  it("keeps Auto/high agent counts in 8–16 on 96 maps and lets Low reduce them", () => {
    expect(agentCountFor(96, "high")).toBe(12);
    expect(agentCountFor(96, "medium")).toBe(12);
    expect(agentCountFor(96, "low")).toBe(6);
    expect(agentCountFor(64, "high")).toBe(8);
    expect(agentCountFor(128, "high")).toBe(16);
  });

  it("ticks agents without mutating CityDocumentV1 or its generator hash", async () => {
    const city = await generateRoadCity({
      id: "city-agents",
      name: "Agent City",
      seed: "agent-mutation",
      timestamp,
      parameters: { ...PRESET_PARAMETERS.balanced, size: 64 },
      assets: TEST_ASSETS,
    });
    const before = structuredClone(city);
    const hash = hashGeneratedStructure(city);
    const snapshot = JSON.stringify(city);
    const agents = spawnAgents({
      seed: city.generator.seed,
      tiles: city.roadGraph.cells,
      count: 8,
    });
    expect(agents.length).toBe(8);
    let current = agents;
    for (let step = 0; step < 30; step += 1) {
      current = tickAgents(current, {
        policy: createRoadWalkPolicy(city.roadGraph.cells),
        dt: 1 / 30,
        seed: city.generator.seed,
      });
    }
    expect(current.some((agent) => agent.moving || agent.destCount >= 1)).toBe(true);
    expect(JSON.stringify(city)).toBe(snapshot);
    expect(hashGeneratedStructure(city)).toBe(hash);
    expect(city).toEqual(before);
    expect(Object.values(city.entities).every((entity) => !entity.id.startsWith("agent:"))).toBe(
      true,
    );
  });
});
