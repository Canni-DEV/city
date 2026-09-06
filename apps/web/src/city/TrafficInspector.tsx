import type { DriveNetwork } from "@city/core";

export function TrafficInspector({
  network,
  selected,
  onSelect,
}: {
  network: DriveNetwork;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const segment = selected ? network.byId.get(selected) : undefined;
  const section = network.topology.sections.find((s) => s.id === segment?.sectionId);
  const issues = network.validation.issues.filter(
    (i) => i.segmentId === selected || i.sectionId === section?.id,
  );
  return (
    <fieldset
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onSelect(null);
        }
      }}
    >
      <legend>Traffic lanes</legend>
      <p>
        Solid cyan: lanes. Dashed amber: turns and joins. Purple: roundabout. White arrows:
        direction. Gray: carriageway edges. Pink: pedestrian crossings. Red: invalid movement.
      </p>
      <p role="status">
        {network.segments.length} segments · {network.topology.portals.length} portals ·{" "}
        {network.validation.issues.length} issues
      </p>
      <label>
        Inspect segment
        <select value={segment?.id ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
          <option value="">No segment selected</option>
          {network.segments.map((s) => (
            <option key={s.id} value={s.id}>
              {s.kind} · {s.id}
            </option>
          ))}
        </select>
      </label>
      {segment && (
        <>
          <dl>
            <dt>ID</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{segment.id}</dd>
            <dt>Class / movement</dt>
            <dd>
              {section?.roadClass} / {segment.kind}
            </dd>
            <dt>Length</dt>
            <dd>{segment.length.toFixed(3)} cells</dd>
            <dt>From → to</dt>
            <dd style={{ overflowWrap: "anywhere" }}>
              {segment.from} → {segment.to}
            </dd>
            <dt>Road tiles</dt>
            <dd>{section?.tileIds.join(", ")}</dd>
            <dt>Pedestrian crossings</dt>
            <dd>{segment.crossingIds.join(", ") || "None"}</dd>
            <dt>Validation</dt>
            <dd>
              {issues.length ? issues.map((i) => `${i.code}: ${i.message}`).join("; ") : "Valid"}
            </dd>
          </dl>
          <p>Continue to:</p>
          {segment.successors.map((id) => (
            <button
              type="button"
              key={id}
              onClick={() => onSelect(id)}
              style={{ overflowWrap: "anywhere" }}
            >
              {id}
            </button>
          ))}
          <button type="button" onClick={() => onSelect(null)}>
            Clear selection
          </button>
        </>
      )}
    </fieldset>
  );
}
