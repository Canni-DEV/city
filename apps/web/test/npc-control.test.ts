import { describe, expect, it } from "vitest";
import { enterNpcFollow, exitNpcControl, toggleFreeFlight } from "../src/city/camera-mode";

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
});
