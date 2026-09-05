import { describe, expect, it } from "vitest";
import { resolveQuality, resolveQualityLevel } from "../src/rendering/quality";

describe("REN-003/REN-008 quality profiles", () => {
  it("maps Auto to Low/Medium/High from backend and device memory", () => {
    expect(resolveQualityLevel("auto", "webgpu")).toBe("high");
    expect(resolveQualityLevel("auto", "webgl2")).toBe("medium");
    expect(resolveQualityLevel("auto", "webgpu", 4)).toBe("low");
    expect(resolveQualityLevel("high", "webgl2", 4)).toBe("high");
  });

  it("low quality disables shadows and decoration while keeping the same map size inputs", () => {
    const low = resolveQuality("low", "webgpu", 96);
    const high = resolveQuality("high", "webgpu", 96);
    expect(low.showDecoration).toBe(false);
    expect(low.useLod).toBe(true);
    expect(low.shadows).toBe(false);
    expect(high.showDecoration).toBe(true);
    expect(high.useLod).toBe(false);
    expect(high.shadows).toBe(true);
    expect(low.fogFar).toBeLessThan(high.fogFar);
    expect(low.agentCount).toBeLessThan(high.agentCount);
    expect(high.agentCount).toBe(12);
    expect(low.agentCount).toBe(6);
  });
});
