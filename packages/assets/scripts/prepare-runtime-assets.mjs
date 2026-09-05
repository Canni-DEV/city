import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const targetRoot = path.resolve(repositoryRoot, "apps/web/public/runtime-assets");
const expectedTarget = path.join(repositoryRoot, "apps", "web", "public", "runtime-assets");
if (targetRoot !== expectedTarget || !targetRoot.startsWith(repositoryRoot + path.sep)) {
  throw new Error(`Unsafe runtime asset target: ${targetRoot}`);
}

const catalog = JSON.parse(
  await readFile(
    path.join(repositoryRoot, "packages/assets/catalog/catalog.generated.json"),
    "utf8",
  ),
);
await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

const copied = new Set();
for (const entry of catalog.entries) {
  const destination = path.join(repositoryRoot, "apps/web/public", entry.runtimePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(repositoryRoot, entry.sourceFile), destination);
  copied.add(entry.runtimePath);

  const packDirectory = entry.sourceFile.split("/")[1];
  for (const runtimeTexture of entry.texturePaths) {
    if (copied.has(runtimeTexture)) continue;
    const textureName = path.basename(runtimeTexture);
    const sourceTexture =
      textureName === "colormap.png"
        ? path.join(
            repositoryRoot,
            "assets",
            packDirectory,
            "Models/GLB format/Textures",
            textureName,
          )
        : path.join(repositoryRoot, "assets", packDirectory, "Models/Textures", textureName);
    const textureDestination = path.join(repositoryRoot, "apps/web/public", runtimeTexture);
    await mkdir(path.dirname(textureDestination), { recursive: true });
    await cp(sourceTexture, textureDestination);
    copied.add(runtimeTexture);
  }
}
console.log(
  `Prepared ${copied.size} runtime files in ${path.relative(repositoryRoot, targetRoot)}`,
);
