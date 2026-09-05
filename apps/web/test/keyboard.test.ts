import { describe, expect, it } from "vitest";
import { isEditableTarget } from "../src/city/keyboard";

describe("city keyboard helpers", () => {
  it("treats form fields as editable so camera shortcuts do not steal typing", () => {
    const input = { isContentEditable: false, tagName: "INPUT" } as HTMLElement;
    const paragraph = { isContentEditable: false, tagName: "P" } as HTMLElement;
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(paragraph)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
