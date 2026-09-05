import { assetCatalog } from "@city/assets";
import { Panel } from "@city/ui";
import { useMemo, useState } from "react";
import { AssetCanvas } from "../viewer/AssetCanvas";

export function AssetViewerPage() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(assetCatalog.entries[0]?.id ?? "");
  const [backend, setBackend] = useState<"webgpu" | "webgl2" | "initializing">("initializing");
  const entries = useMemo(
    () => assetCatalog.entries.filter((entry) => entry.id.includes(query.trim().toLowerCase())),
    [query],
  );
  const selected =
    assetCatalog.entries.find((entry) => entry.id === selectedId) ?? assetCatalog.entries[0];
  if (!selected) return <p>Catalog is empty.</p>;

  return (
    <div className="asset-layout">
      <aside className="asset-sidebar">
        <div>
          <p className="eyebrow">Development tool</p>
          <h1>Asset catalog</h1>
          <p>{assetCatalog.entries.length} validated models</p>
        </div>
        <label>
          Filter assets
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="roads:road-curve"
          />
        </label>
        <div className="asset-list" role="listbox" aria-label="Assets">
          {entries.map((entry) => (
            <button
              type="button"
              role="option"
              aria-selected={entry.id === selected.id}
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
            >
              {entry.id}
            </button>
          ))}
        </div>
      </aside>
      <section className="asset-stage">
        <div className="canvas-wrap">
          <AssetCanvas entry={selected} onBackend={setBackend} />
        </div>
        <Panel className="asset-metadata">
          <div>
            <span className="status-pill">{backend}</span>
            <h2>{selected.id}</h2>
            <p>
              {selected.category} · {selected.subcategory}
            </p>
          </div>
          <dl>
            <dt>Dimensions</dt>
            <dd>{selected.dimensions.map((value) => value.toFixed(2)).join(" × ")}</dd>
            <dt>Footprint</dt>
            <dd>
              {selected.footprint.width.toFixed(2)} × {selected.footprint.depth.toFixed(2)}
            </dd>
            <dt>Front</dt>
            <dd>{selected.front}</dd>
            <dt>Rotations</dt>
            <dd>
              {selected.allowedRotations === "free" ? "free" : selected.allowedRotations.join(", ")}
            </dd>
            <dt>Connectors</dt>
            <dd>{selected.connectors.join(", ") || "none"}</dd>
            <dt>Zones</dt>
            <dd>{selected.compatibleZones.join(", ") || "not applicable"}</dd>
            <dt>V1</dt>
            <dd>{selected.availableInV1 ? "available" : "cataloged only"}</dd>
          </dl>
        </Panel>
      </section>
    </div>
  );
}
