export interface CityEntryState {
  source: "experience";
  controlledNpcId: string;
}

export function cityEntryFromState(value: unknown): CityEntryState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CityEntryState>;
  return candidate.source === "experience" &&
    typeof candidate.controlledNpcId === "string" &&
    candidate.controlledNpcId.length > 0
    ? { source: "experience", controlledNpcId: candidate.controlledNpcId }
    : null;
}
