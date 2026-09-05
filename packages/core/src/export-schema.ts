import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { CityDocumentSchema } from "./domain.js";

const schemaDirectory = new URL("../schema/", import.meta.url);
await mkdir(schemaDirectory, { recursive: true });
const jsonSchema = z.toJSONSchema(CityDocumentSchema, {
  target: "draft-2020-12",
  io: "output",
});
await writeFile(
  new URL("city-document.v1.schema.json", schemaDirectory),
  `${JSON.stringify(jsonSchema, null, 2)}\n`,
  "utf8",
);
