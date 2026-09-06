// SIM-017: reproducible measurements, in model-local X/Z coordinates.
export function measureDriveProfile(buffer, settings) {
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString()
      .trim(),
  );
  const bin = buffer.subarray(28 + jsonLength);
  const read = (index, size) => {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: size }, (_, j) => {
        const offset =
          (view.byteOffset ?? 0) +
          (a.byteOffset ?? 0) +
          i * (view.byteStride ?? bytes * size) +
          j * bytes;
        return a.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUIntLE(offset, bytes);
      }),
    );
  };
  const triangles = [];
  for (const node of gltf.nodes ?? []) {
    if (node.mesh === undefined) continue;
    if (node.matrix || node.rotation || node.scale || node.translation)
      throw new Error("Road profile requires an untransformed source mesh");
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const positions = read(primitive.attributes.POSITION, 3);
      const normals = read(primitive.attributes.NORMAL, 3);
      const indices = read(primitive.indices, 1).flat();
      for (let i = 0; i < indices.length; i += 3) {
        const ids = indices.slice(i, i + 3);
        if (
          !ids.every(
            (id) =>
              normals[id][1] > 0.99 && Math.abs(positions[id][1] - settings.surfaceHeight) < 0.0001,
          )
        )
          continue;
        triangles.push(
          ids.map((id) => [positions[id][0], positions[id][2]].map((n) => Number(n.toFixed(6)))),
        );
      }
    }
  }
  if (!triangles.length) throw new Error("Empty measured carriageway");
  return { ...settings, triangles };
}

export function measureVehicleBounds(buffer) {
  const gltf = JSON.parse(
    buffer
      .subarray(20, 20 + buffer.readUInt32LE(12))
      .toString()
      .trim(),
  );
  const min = [Infinity, Infinity],
    max = [-Infinity, -Infinity];
  const parents = new Map();
  for (const [i, node] of gltf.nodes.entries())
    for (const child of node.children ?? []) parents.set(child, i);
  const translation = (index) => {
    const node = gltf.nodes[index];
    if (node.matrix || node.rotation || node.scale)
      throw new Error("Unsupported vehicle transform");
    const parent = parents.has(index) ? translation(parents.get(index)) : [0, 0, 0];
    return parent.map((v, i) => v + (node.translation?.[i] ?? 0));
  };
  for (const [index, node] of gltf.nodes.entries()) {
    if (node.mesh === undefined || /wheel/i.test(node.name ?? "")) continue;
    const offset = translation(index);
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const a = gltf.accessors[primitive.attributes.POSITION];
      for (const [i, axis] of [0, 2].entries()) {
        min[i] = Math.min(min[i], a.min[axis] + offset[axis]);
        max[i] = Math.max(max[i], a.max[axis] + offset[axis]);
      }
    }
  }
  return { min: min.map((n) => Number(n.toFixed(6))), max: max.map((n) => Number(n.toFixed(6))) };
}
