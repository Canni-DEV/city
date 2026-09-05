export function isEditableTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const element = target as { isContentEditable?: boolean; tagName?: string };
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
