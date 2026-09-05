import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnimationClip,
  Bone,
  Box3,
  LoadingManager,
  MathUtils,
  MeshStandardMaterial,
  Scene,
  SkinnedMesh,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const packRoot = path.join(repositoryRoot, "assets/kenney_animated-characters-protagonists");
const outputRoot = path.join(repositoryRoot, "packages/assets/generated/characters");

const CLIP_FILES = [
  { name: "idle", source: "Animations/idle.fbx" },
  { name: "run", source: "Animations/run.fbx" },
  { name: "jump", source: "Animations/jump.fbx" },
];

class NodeFileReader {
  result = null;
  onloadend = null;
  onload = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
      this.onload?.({ target: this });
    });
  }
}

globalThis.FileReader = NodeFileReader;

function installDeterministicIds() {
  let sequence = 0;
  MathUtils.generateUUID = () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  };
}

function installTextureStub() {
  TextureLoader.prototype.load = function load(_url, onLoad) {
    const texture = new Texture();
    if (onLoad) onLoad(texture);
    return texture;
  };
}

function parseFbx(buffer, resourcePath) {
  const manager = new LoadingManager();
  manager.onError = () => {};
  const loader = new FBXLoader(manager);
  return loader.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    resourcePath,
  );
}

function pruneAndNormalize(root) {
  const remove = [];
  root.traverse((child) => {
    if (child.isLight || child.isCamera || child.isLine) remove.push(child);
  });
  for (const child of remove) child.parent?.remove(child);
  root.traverse((child) => {
    if (!(child instanceof SkinnedMesh) && !child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const next = materials.map(
      (material) =>
        new MeshStandardMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.7,
          name: material?.name || "character",
        }),
    );
    child.material = next.length === 1 ? next[0] : next;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);
}

function firstClip(root, name) {
  const clip = root.animations[0];
  if (!clip) throw new Error(`No animation clip in ${name}`);
  const renamed = AnimationClip.parse(clip.toJSON());
  renamed.name = name;
  return renamed;
}

function measureMeshes(root) {
  const report = [];
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (!(child instanceof SkinnedMesh) && !child.isMesh) return;
    child.geometry.computeBoundingBox();
    const box = new Box3().setFromObject(child);
    const size = box.getSize(new Vector3());
    report.push({
      name: child.name,
      skinned: child instanceof SkinnedMesh,
      bones:
        child instanceof SkinnedMesh
          ? child.skeleton.bones.filter((bone) => bone instanceof Bone).length
          : 0,
      size: [size.x, size.y, size.z],
      minY: box.min.y,
      maxY: box.max.y,
    });
  });
  const box = new Box3().setFromObject(root);
  return { meshes: report, root: box.getSize(new Vector3()), minY: box.min.y };
}

async function exportGlb(root, clips) {
  const scene = new Scene();
  scene.name = "protagonist";
  scene.add(root);
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(scene, {
    binary: true,
    animations: clips,
    onlyVisible: false,
    embedImages: false,
  });
  if (!(data instanceof ArrayBuffer)) throw new Error("Expected binary GLB");
  return Buffer.from(data);
}

installDeterministicIds();
installTextureStub();
await mkdir(outputRoot, { recursive: true });

const bodyBuffer = await readFile(path.join(packRoot, "Model/characterMedium.fbx"));
const inspect = parseFbx(bodyBuffer, `${path.join(packRoot, "Skins")}/`);
pruneAndNormalize(inspect);
const measured = measureMeshes(inspect);
console.log(JSON.stringify(measured, null, 2));

const clips = [];
for (const clipFile of CLIP_FILES) {
  const buffer = await readFile(path.join(packRoot, clipFile.source));
  const parsed = parseFbx(buffer, `${path.join(packRoot, "Skins")}/`);
  clips.push(firstClip(parsed, clipFile.name));
}

const TARGET_HEIGHT = 0.32;
const pedestrianScale = TARGET_HEIGHT / measured.root.y;
console.log(
  `Baking pedestrian scale ${pedestrianScale.toFixed(8)} so height≈${TARGET_HEIGHT} vs building-a 1.293`,
);

function prepareRoot(root, name) {
  root.name = name;
  pruneAndNormalize(root);
  root.scale.setScalar(pedestrianScale);
  root.updateMatrixWorld(true);
}

const body = parseFbx(bodyBuffer, `${path.join(packRoot, "Skins")}/`);
prepareRoot(body, "characterMedium");
console.log("scaled", JSON.stringify(measureMeshes(body)));
await writeFile(path.join(outputRoot, "character-medium.glb"), await exportGlb(body, clips));

for (const clip of clips) {
  const root = parseFbx(bodyBuffer, `${path.join(packRoot, "Skins")}/`);
  prepareRoot(root, clip.name);
  await writeFile(path.join(outputRoot, `${clip.name}.glb`), await exportGlb(root, [clip]));
}

console.log(`Wrote character GLBs to ${path.relative(repositoryRoot, outputRoot)}`);
