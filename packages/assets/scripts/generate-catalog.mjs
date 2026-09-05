import { createHash } from "node:crypto";
import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const sourceRoot = path.join(repositoryRoot, "assets");
const catalogPath = path.join(repositoryRoot, "packages/assets/catalog/catalog.generated.json");
const overridesPath = path.join(repositoryRoot, "packages/assets/catalog/overrides.json");

const packs = [
  { directory: "kenney_city-kit-commercial_2.1", id: "commercial" },
  { directory: "kenney_city-kit-industrial_2.0", id: "industrial" },
  { directory: "kenney_city-kit-roads", id: "roads" },
  { directory: "kenney_city-kit-suburban_20", id: "suburban" },
];

function posix(value) {
  return value.split(path.sep).join("/");
}

function parseBounds(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("Invalid GLB header");
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer
      .subarray(20, 20 + jsonLength)
      .toString()
      .replaceAll("\0", "")
      .trim(),
  );
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], accessor.min[axis]);
        maximum[axis] = Math.max(maximum[axis], accessor.max[axis]);
      }
    }
  }
  if (minimum.some((value) => !Number.isFinite(value)))
    throw new Error("GLB has no position bounds");
  return {
    dimensions: maximum.map((value, axis) => Number((value - minimum[axis]).toFixed(4))),
    minimum,
  };
}

function classify(pack, model) {
  if (pack === "commercial") {
    if (model.startsWith("low-detail-building")) return ["lod", "commercial-building-lod"];
    if (model.startsWith("building-skyscraper")) return ["building", "commercial-skyscraper"];
    if (model.startsWith("building")) return ["building", "commercial-building"];
    return ["decoration", "commercial-detail"];
  }
  if (pack === "industrial") {
    if (model.startsWith("building")) return ["building", "industrial-building"];
    if (/^(windmill|solar-panel|water-tower|chimney|detail-tank)/.test(model)) {
      return ["infrastructure", "industrial-infrastructure"];
    }
    return ["decoration", "industrial-detail"];
  }
  if (pack === "suburban") {
    if (model.startsWith("building")) return ["building", "suburban-building"];
    if (model.startsWith("tree")) return ["vegetation", "tree"];
    return ["decoration", "suburban-detail"];
  }
  if (model.startsWith("road-") && !model.startsWith("road-sign")) return ["road", "road-tile"];
  if (model.startsWith("bridge-pillar")) return ["road-structure", "bridge-structure"];
  if (model.startsWith("tile-")) return ["terrain", "road-terrain"];
  if (/^(electricity|light-)/.test(model)) return ["infrastructure", "street-utility"];
  return ["street-furniture", "street-detail"];
}

function zones(pack, category) {
  if (category === "road" || category === "road-structure" || category === "terrain") return [];
  if (pack === "commercial") return ["commercial", "urban"];
  if (pack === "industrial") return ["industrial"];
  if (pack === "suburban")
    return category === "vegetation" ? ["suburban", "urban", "park"] : ["suburban", "urban"];
  return ["suburban", "urban", "commercial", "industrial", "park"];
}

function roadConnectors(model) {
  if (/roundabout|crossroad/.test(model)) return ["north", "east", "south", "west"];
  if (/intersection|split/.test(model)) return ["north", "east", "south"];
  if (/curve|bend/.test(model)) return ["east", "south"];
  if (/road-end/.test(model)) return ["north"];
  return ["north", "south"];
}

function previewFor(packDirectory, model) {
  return posix(path.join("assets", packDirectory, "Previews", `${model}.png`));
}

const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
const entries = [];
const digest = createHash("sha256");

for (const pack of packs) {
  const glbDirectory = path.join(sourceRoot, pack.directory, "Models/GLB format");
  const modelFiles = (await readdir(glbDirectory)).filter((name) => name.endsWith(".glb")).sort();
  const textureFiles = ["colormap.png"];
  const variationDirectory = path.join(sourceRoot, pack.directory, "Models/Textures");
  for (const variation of (await readdir(variationDirectory))
    .filter((name) => name.endsWith(".png"))
    .sort()) {
    textureFiles.push(variation);
  }

  for (const filename of modelFiles) {
    const model = path.basename(filename, ".glb");
    const sourcePath = path.join(glbDirectory, filename);
    const buffer = await readFile(sourcePath);
    digest.update(pack.id).update(model).update(buffer);
    const bounds = parseBounds(buffer);
    const [category, subcategory] = classify(pack.id, model);
    const elevated = pack.id === "roads" && /bridge|slant|high|pillar/.test(model);
    const id = `${pack.id}:${model}`;
    const isDecoration = ["decoration", "street-furniture", "vegetation"].includes(category);
    const isBuilding = category === "building" || category === "lod";
    const lodCandidate =
      pack.id === "commercial" && /^building-[a-n]$/.test(model)
        ? `commercial:low-detail-${model}`
        : null;
    const entry = {
      id,
      pack: pack.id,
      model,
      sourceFile: posix(path.relative(repositoryRoot, sourcePath)),
      runtimePath: `runtime-assets/${pack.id}/${filename}`,
      previewFile: previewFor(pack.directory, model),
      texturePaths: textureFiles.map((texture) => `runtime-assets/${pack.id}/Textures/${texture}`),
      category,
      subcategory,
      dimensions: bounds.dimensions.map((value) => Math.max(value, 0.0001)),
      footprint: {
        width: Math.max(bounds.dimensions[0], 0.0001),
        depth: Math.max(bounds.dimensions[2], 0.0001),
      },
      verticalOffset: Number((-bounds.minimum[1]).toFixed(4)),
      front: isBuilding ? "south" : isDecoration ? "omnidirectional" : "not-applicable",
      allowedRotations: isDecoration ? "free" : [0, 90, 180, 270],
      compatibleZones: zones(pack.id, category),
      proceduralWeight: category === "lod" ? 0 : 1,
      connectors: category === "road" ? roadConnectors(model) : [],
      instancing: true,
      lodModelId: lodCandidate,
      decoration: isDecoration,
      elevated,
      availableInV1: category !== "lod" && !elevated,
      review: "heuristic",
      ...(overrides[id] ?? {}),
    };
    entries.push(entry);
  }
}

entries.sort((left, right) => left.id.localeCompare(right.id));
if (entries.length !== 213)
  throw new Error(`Expected 213 catalog entries, found ${entries.length}`);
const entryIds = new Set(entries.map((entry) => entry.id));
if (entryIds.size !== entries.length) throw new Error("Catalog contains duplicate IDs");
for (const entry of entries) {
  await access(path.join(repositoryRoot, entry.sourceFile));
  await access(path.join(repositoryRoot, entry.previewFile));
  if (entry.footprint.width <= 0 || entry.footprint.depth <= 0) {
    throw new Error(`Invalid footprint for ${entry.id}`);
  }
  if (entry.category === "road" && entry.connectors.length === 0) {
    throw new Error(`Road entry has no connectors: ${entry.id}`);
  }
  if (entry.lodModelId && !entryIds.has(entry.lodModelId)) {
    throw new Error(`Missing LOD reference ${entry.lodModelId} for ${entry.id}`);
  }
}
const catalog = {
  schemaVersion: 1,
  generatedAt: "2026-09-04T00:00:00.000Z",
  sourceDigest: digest.digest("hex"),
  entries,
};
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(
  `Generated ${entries.length} asset entries at ${path.relative(repositoryRoot, catalogPath)}`,
);
