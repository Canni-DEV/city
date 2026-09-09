import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  behindNpcFollowOffset,
  CITY_ORBIT_MAX_ZOOM,
  enterNpcFollow,
  exitNpcControl,
  followFramingIsValid,
  NPC_FOLLOW_PITCH,
  npcFollowCameraPose,
  springNpcFollowLook,
  toggleFreeFlight,
} from "../src/city/camera-mode";
import { isEditableTarget } from "../src/city/keyboard";
import { npcScenePose, npcSceneVelocity } from "../src/city/npc-visual";

const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

describe("TST-013 NPC camera transitions", () => {
  it("enters follow only with an NPC and always releases to city orbit", () => {
    expect(enterNpcFollow(false)).toBe("cityOrbit");
    expect(enterNpcFollow(true)).toBe("npcFollow");
    expect(exitNpcControl()).toBe("cityOrbit");
  });

  it("toggles free flight only outside NPC control", () => {
    expect(toggleFreeFlight("cityOrbit", false)).toBe("freeFlight");
    expect(toggleFreeFlight("freeFlight", false)).toBe("cityOrbit");
    expect(toggleFreeFlight("npcFollow", true)).toBe("npcFollow");
  });

  it("frames the follow camera behind the NPC yaw", () => {
    const target = { x: 10, y: 1, z: -4 };
    const camera = behindNpcFollowOffset(target, 0);
    expect(followFramingIsValid(camera, target)).toBe(true);
    expect(followFramingIsValid(target, target)).toBe(false);
    expect(camera.z).toBeLessThan(target.z);
    expect(camera.y).toBeGreaterThan(target.y);
    const beside = npcFollowCameraPose(target, 0, Math.PI / 2, NPC_FOLLOW_PITCH, 2.6);
    expect(beside.x).not.toBeCloseTo(camera.x);
  });

  it("springs look yaw toward zero and pitch toward the default", () => {
    const next = springNpcFollowLook(1, 1, 0.2);
    expect(Math.abs(next.lookYaw)).toBeLessThan(1);
    expect(Math.abs(next.lookPitch - NPC_FOLLOW_PITCH)).toBeLessThan(
      Math.abs(1 - NPC_FOLLOW_PITCH),
    );
  });

  it("binds a dedicated third-person perspective camera without OrbitControls", () => {
    const text = readFileSync(join(webRoot, "src/city/NpcFollowCamera.tsx"), "utf8");
    expect(text).toMatch(/new THREE\.PerspectiveCamera/);
    expect(text).toMatch(/npcFollowCameraPose/);
    expect(text).toMatch(/npcScenePose\(pose, mapSize\)/);
    expect(text).not.toMatch(/OrbitControls/);
    expect(text).not.toMatch(/<PerspectiveCamera/);
    expect(text).not.toMatch(/size \/ 2/);
    expect(text).not.toMatch(/useFrame\([\s\S]*?,\s*[1-9]\d*\s*\)/);
  });

  it("raises city orbit maxZoom to sidewalk scale", () => {
    expect(CITY_ORBIT_MAX_ZOOM).toBe(96);
    const canvas = readFileSync(join(webRoot, "src/city/CityCanvas.tsx"), "utf8");
    expect(canvas).toMatch(/maxZoom=\{CITY_ORBIT_MAX_ZOOM\}/);
  });
});

describe("TST-013 procedural gait sample space", () => {
  it("places the actor in the same scene space as city tiles", () => {
    const pose = { x: 10, y: 0.02, z: 4 };
    const placed = npcScenePose(pose, 96);
    expect(placed.x).toBe(10 - 48);
    expect(placed.z).toBe(4 - 48);
    expect(placed.y).toBeGreaterThan(pose.y);
    const velocity = npcSceneVelocity(pose, { x: 10.33, y: 0.02, z: 4 }, 1);
    expect(velocity.x).toBeCloseTo(0.33);
    expect(velocity.y).toBe(0);
    expect(velocity.z).toBe(0);
  });

  it("does not parent the procedural root on a map-space offset group", () => {
    const layer = readFileSync(join(webRoot, "src/city/AgentLayer.tsx"), "utf8");
    const simulation = readFileSync(join(webRoot, "src/city/SimulationLayer.tsx"), "utf8");
    expect(layer).toMatch(/npcScenePose/);
    expect(layer).not.toMatch(/position=\{\[-half/);
    expect(layer).toMatch(/locomotion\?\.speed/);
    expect(simulation).toMatch(/npcScenePose/);
    expect(simulation).toMatch(/npcSceneVelocity/);
  });
});

describe("TST-013 selection and input cleanup", () => {
  it("excludes editable fields from gameplay keyboard handling", () => {
    expect(isEditableTarget({ isContentEditable: false, tagName: "INPUT" } as HTMLElement)).toBe(
      true,
    );
    expect(isEditableTarget({ isContentEditable: false, tagName: "SELECT" } as HTMLElement)).toBe(
      true,
    );
    expect(isEditableTarget({ isContentEditable: true, tagName: "DIV" } as HTMLElement)).toBe(true);
    expect(isEditableTarget({ isContentEditable: false, tagName: "BUTTON" } as HTMLElement)).toBe(
      false,
    );
  });
});

describe("TST-013 production lab exclusion", () => {
  it("keeps the animation lab and Rapier behind development-only entry points", () => {
    const app = readFileSync(join(webRoot, "src/App.tsx"), "utf8");
    const library = readFileSync(join(webRoot, "src/pages/LibraryPage.tsx"), "utf8");
    expect(app).toMatch(/const AnimationLabPage = import\.meta\.env\.DEV/);
    expect(app).toMatch(/path="\/dev\/animations"/);
    expect(library).toMatch(/import\.meta\.env\.DEV/);
    expect(library).toMatch(/Animation lab/);
    const citySources = [
      "src/App.tsx",
      "src/pages/CityPage.tsx",
      "src/pages/LibraryPage.tsx",
      "src/city/AgentLayer.tsx",
      "src/city/CityCanvas.tsx",
      "src/city/SimulationLayer.tsx",
      "src/city/NpcControlInput.tsx",
      "src/city/NpcFollowCamera.tsx",
      "src/city/npc-visual.ts",
    ];
    for (const file of citySources) {
      const text = readFileSync(join(webRoot, file), "utf8").toLowerCase();
      expect(text).not.toMatch(/rapier/);
      expect(text).not.toMatch(/procedural-animation\/physics/);
    }
  });

  it("omits the animation lab and Rapier from production bundles when dist exists", () => {
    const assets = join(webRoot, "dist/assets");
    if (!existsSync(assets)) return;
    const files = readdirSync(assets).filter((name) => name.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((name) => /animationlab|rapier/i.test(name))).toBe(false);
    for (const name of files) {
      const text = readFileSync(join(assets, name), "utf8");
      expect(text).not.toMatch(/@dimforge\/rapier/i);
      expect(text).not.toMatch(/Animation lab/);
    }
  });
});
