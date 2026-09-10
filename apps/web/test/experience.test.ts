import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyCityDocument, type NpcPose, PRESET_PARAMETERS } from "@city/core";
import { describe, expect, it } from "vitest";
import { cityEntryFromState } from "../src/city/city-entry";
import {
  experienceCameraFrame,
  experienceReveal,
  gatedExperienceProgress,
  scrollProgress,
  selectExperienceHero,
} from "../src/experience/experience-timeline";
import { useCityStore } from "../src/state/city-store";

const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function documentFixture() {
  return createEmptyCityDocument({
    id: "city-experience",
    name: "Green Crossroads",
    seed: "green-crossroads",
    parameters: PRESET_PARAMETERS.balanced,
    timestamp: "2026-09-09T00:00:00.000Z",
  });
}

describe("TST-014 cinematic experience timeline", () => {
  it("normalizes native scroll and gates the reveal until the scene is ready", () => {
    expect(scrollProgress(0, 5000, 1000)).toBe(0);
    expect(scrollProgress(2000, 5000, 1000)).toBe(0.5);
    expect(scrollProgress(9000, 5000, 1000)).toBe(1);
    expect(gatedExperienceProgress(0.8, false)).toBe(0.28);
    expect(gatedExperienceProgress(0.8, true)).toBe(0.8);
    expect(gatedExperienceProgress(Number.NaN, true)).toBe(0);
  });

  it("zooms immediately with the aperture locked to the dot at both desktop sizes", () => {
    for (const [width, height] of [
      [1280, 720],
      [1920, 1080],
    ] as const) {
      const dot = (Math.min(width * 0.78, 1100) * 10) / 520;
      const cover = Math.hypot(width, height) * 0.82;
      let previous = 1;
      for (let step = 1; step <= 62; step++) {
        const reveal = experienceReveal(step / 100, dot, cover);
        expect(reveal.scale).toBeGreaterThan(previous);
        expect(reveal.maskRadius).toBeCloseTo(dot * reveal.scale);
        previous = reveal.scale;
      }
      expect(experienceReveal(0.62, dot, cover).maskRadius).toBeGreaterThan(
        Math.hypot(width, height) / 2,
      );
    }
  });

  it("advances toward the hero on every scroll step without a focal-length reversal or stop", () => {
    const hero = { id: "npc:0", pose: { x: 40, y: 0, z: 55, yaw: 2.7, speed: 0 } };
    let previous = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 1000; step++) {
      const frame = experienceCameraFrame(step / 1000, 96, hero);
      const distance = Math.hypot(...frame.position.map((v, i) => v - (frame.target[i] ?? 0)));
      expect(distance).toBeLessThan(previous);
      expect(frame.fov).toBe(43);
      previous = distance;
    }
  });

  it("selects a deterministic central hero without mutating the document", () => {
    const document = documentFixture();
    const before = JSON.stringify(document);
    const poses = new Map<string, NpcPose>([
      ["npc:1", { x: 2, y: 0, z: 2, yaw: Math.PI, speed: 0 }],
      ["npc:0", { x: 48, y: 0, z: 48, yaw: 0, speed: 0 }],
    ]);
    expect(selectExperienceHero(document, poses)?.id).toBe("npc:0");
    expect(selectExperienceHero(document, poses)?.id).toBe("npc:0");
    expect(JSON.stringify(document)).toBe(before);
  });

  it("keeps every camera frame finite and reverses to the same frame", () => {
    const hero = {
      id: "npc:0",
      pose: { x: 48, y: 0, z: 48, yaw: Math.PI / 4, speed: 0 },
    };
    const first = experienceCameraFrame(0.73, 96, hero);
    experienceCameraFrame(1, 96, hero);
    const reversed = experienceCameraFrame(0.73, 96, hero);
    expect(reversed).toEqual(first);
    expect([...first.position, ...first.target, first.fov].every(Number.isFinite)).toBe(true);
    expect(experienceCameraFrame(1, 96, hero).position[1]).toBeGreaterThan(hero.pose.y);
  });
});

describe("TST-014 experience handoff and route isolation", () => {
  it("validates transient entry state and adopts the exact document identity", () => {
    const document = documentFixture();
    expect(cityEntryFromState({ source: "experience", controlledNpcId: "npc:0" })).toEqual({
      source: "experience",
      controlledNpcId: "npc:0",
    });
    expect(cityEntryFromState({ source: "experience", controlledNpcId: "" })).toBeNull();
    expect(cityEntryFromState({ source: "other", controlledNpcId: "npc:0" })).toBeNull();
    useCityStore.getState().adoptDocument(document, 42);
    expect(useCityStore.getState().document).toBe(document);
    expect(useCityStore.getState().durationMs).toBe(42);
  });

  it("ships the direct route without adding a navigation link", () => {
    const app = readFileSync(join(webRoot, "src/App.tsx"), "utf8");
    const library = readFileSync(join(webRoot, "src/pages/LibraryPage.tsx"), "utf8");
    expect(app).toMatch(/path="\/experience"/);
    expect(app).toMatch(/location\.pathname === "\/experience"/);
    expect(library).not.toMatch(/\/experience/);
  });

  it("keeps the experience on native scroll with a desktop and reduced-motion branch", () => {
    const page = readFileSync(join(webRoot, "src/pages/ExperiencePage.tsx"), "utf8");
    expect(page).toMatch(/min-width: 1280px/);
    expect(page).toMatch(/prefers-reduced-motion: reduce/);
    expect(page).toMatch(/window\.addEventListener\("scroll"/);
    expect(page).not.toMatch(/preventDefault\(\)/);
    expect(page).toMatch(/agentCount: 12, vehicleCount: 12/);
  });
});
