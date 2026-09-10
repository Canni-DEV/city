import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";
import { updateDynamicLines } from "../src/rendering/dynamic-lines";

describe("TST-013 pedestrian diagnostic resource lifetime", () => {
  it("reuses storage over extended updates and draws only live vertices", () => {
    const geometry = new BufferGeometry();
    const dispose = vi.spyOn(geometry, "dispose");
    updateDynamicLines(geometry, [0, 0, 0, 1, 0, 1]);
    const attribute = geometry.getAttribute("position");
    if (!(attribute instanceof BufferAttribute)) throw new Error("Expected contiguous buffer");
    for (let frame = 0; frame < 10000; frame++) {
      updateDynamicLines(geometry, [frame, 0, 0, frame + 1, 0, 1]);
    }
    expect(geometry.getAttribute("position")).toBe(attribute);
    expect(attribute.usage).toBe(DynamicDrawUsage);
    expect(attribute.array[0]).toBe(9999);
    expect(dispose).toHaveBeenCalledTimes(1);
    updateDynamicLines(geometry, []);
    expect(geometry.drawRange.count).toBe(0);
    expect(geometry.getAttribute("position")).toBe(attribute);
    geometry.dispose();
  });

  it("releases storage on growth and retains capacity on shrink", () => {
    const geometry = new BufferGeometry();
    updateDynamicLines(geometry, [0, 0, 0, 1, 0, 1]);
    const previous = geometry.getAttribute("position");
    const dispose = vi.fn(() => expect(geometry.getAttribute("position")).toBe(previous));
    geometry.addEventListener("dispose", dispose);
    const positions = Array.from({ length: 600 }, (_, i) => i);
    updateDynamicLines(geometry, positions);
    expect(dispose).toHaveBeenCalledOnce();
    geometry.removeEventListener("dispose", dispose);
    const grown = geometry.getAttribute("position");
    expect(Array.from(grown.array).slice(0, 600)).toEqual(positions);
    updateDynamicLines(geometry, positions.slice(0, 6));
    expect(geometry.getAttribute("position")).toBe(grown);
    expect(geometry.drawRange.count).toBe(2);
    geometry.dispose();
  });
});
