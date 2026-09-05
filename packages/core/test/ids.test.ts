import { describe, expect, it } from "vitest";
import { createUserEntityId, deriveProceduralId } from "../src";

describe("entity identifiers", () => {
  it("derives stable procedural identifiers", () => {
    expect(deriveProceduralId("seed", "building", 42)).toBe(
      deriveProceduralId("seed", "building", 42),
    );
    expect(deriveProceduralId("seed", "building", 42)).not.toBe(
      deriveProceduralId("seed", "building", 43),
    );
  });

  it("prefixes user entity identifiers", () => {
    expect(createUserEntityId(() => "00000000-0000-4000-8000-000000000000")).toBe(
      "user_00000000-0000-4000-8000-000000000000",
    );
  });
});
