import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from "three/webgpu";
import { expect, it, vi } from "vitest";
import { InstancedAssetBatch } from "../src/city/InstancedAssetBatch";

const hooks = vi.hoisted(() => ({ cleanups: [] as (() => void)[] }));
const source = new MeshStandardMaterial();
const geometry = new BoxGeometry();
const texture = new Texture();
const scene = new Group().add(new Mesh(geometry, source));

// Exercise the batch's resource ownership without mounting a renderer.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (create: () => unknown) => create(),
  useEffect: (effect: () => () => void) => hooks.cleanups.push(effect()),
}));
vi.mock("@react-three/drei", () => ({ useGLTF: () => ({ scene }) }));
vi.mock("@react-three/fiber", () => ({ useLoader: () => texture }));

it("TST-013 batch replacements release owned materials and preserve shared assets", () => {
  const clones: MeshStandardMaterial[] = [];
  const originalClone = source.clone.bind(source);
  vi.spyOn(source, "clone").mockImplementation(() => {
    const clone = originalClone();
    clones.push(clone);
    return clone;
  });
  const sourceDispose = vi.spyOn(source, "dispose");
  const geometryDispose = vi.spyOn(geometry, "dispose");
  const textureDispose = vi.spyOn(texture, "dispose");
  for (let replacement = 0; replacement < 100; replacement++) {
    InstancedAssetBatch({
      batch: {
        key: "roads",
        assetId: "roads:tile-low",
        variant: "colormap",
        texturePath: "colormap.png",
        items: [],
      },
      half: 32,
      castShadow: false,
    });
    const owned = clones.at(-1);
    if (!owned) throw new Error("Expected cloned material");
    const dispose = vi.spyOn(owned, "dispose");
    for (const cleanup of hooks.cleanups.splice(0)) cleanup();
    expect(dispose).toHaveBeenCalledOnce();
  }
  expect(sourceDispose).not.toHaveBeenCalled();
  expect(geometryDispose).not.toHaveBeenCalled();
  expect(textureDispose).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  geometry.dispose();
  source.dispose();
  texture.dispose();
});
