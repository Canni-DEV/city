import type { CityDocumentV1 } from "./domain.js";

export const EDITOR_COMMAND_TYPES = [
  "add",
  "delete",
  "move",
  "rotate",
  "duplicate",
  "multi-transform",
  "regenerate-block",
] as const;

export type EditorCommandType = (typeof EDITOR_COMMAND_TYPES)[number];

export interface EditorCommand {
  readonly id: string;
  readonly type: EditorCommandType;
  readonly label: string;
  apply(document: CityDocumentV1): CityDocumentV1;
  revert(document: CityDocumentV1): CityDocumentV1;
}

export interface CommandHistory {
  readonly past: readonly EditorCommand[];
  readonly future: readonly EditorCommand[];
  readonly limit: 100;
}
