import { BufferAttribute, type BufferGeometry, DynamicDrawUsage } from "three/webgpu";

/** Reuse GPU storage; release the old attribute before growing its capacity. */
export function updateDynamicLines(geometry: BufferGeometry, positions: readonly number[]): void {
  let attribute = geometry.getAttribute("position");
  if (!attribute || attribute.array.length < positions.length) {
    const capacity = Math.max(96, (attribute?.array.length ?? 0) * 2, positions.length);
    geometry.dispose();
    attribute = new BufferAttribute(new Float32Array(capacity), 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
  }
  attribute.array.set(positions);
  attribute.needsUpdate = true;
  geometry.setDrawRange(0, positions.length / 3);
}
