import { readFileSync } from "node:fs";
import type { PlacementAsset } from "../src/placement-assets.js";

const catalog = JSON.parse(
  readFileSync(new URL("../../assets/catalog/catalog.generated.json", import.meta.url), "utf8"),
) as { entries: PlacementAsset[] };

export const TEST_ASSETS = catalog.entries;
