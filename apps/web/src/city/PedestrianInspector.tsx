import { npcDiagnostics } from "@city/core";
import { useEffect, useState } from "react";
import type { SimulationRuntime } from "./simulation-runtime";

export function PedestrianInspector({
  runtime,
  selected,
  onSelect,
}: {
  runtime: SimulationRuntime;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((n) => n + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const agents = npcDiagnostics(runtime.world),
    npc = agents.find((a) => a.id === selected);
  const edge = selected ? runtime.network.edges.get(selected) : undefined;
  return (
    <fieldset className="overlay-controls">
      <legend>Pedestrian navigation</legend>
      <p>
        Blue corridors and arrows · Pink crossings and waiting points · Green park areas · Amber
        accesses · Gray obstacles · Red blocked areas · Lime selected route and body radius.
      </p>
      <div className="field-row">
        <button
          type="button"
          className="city-button"
          onClick={() => {
            runtime.paused = !runtime.paused;
            refresh((n) => n + 1);
          }}
        >
          {runtime.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="city-button"
          disabled={!runtime.paused}
          onClick={() => {
            runtime.steps++;
          }}
        >
          Step
        </button>
      </div>
      <p>
        Simulation tick: {runtime.clock.ticks}. {runtime.paused ? "Paused" : "Running"}. Controls
        affect pedestrians and vehicles.
      </p>
      <label>
        Inspect NPC
        <select value={npc?.id ?? ""} onChange={(event) => onSelect(event.target.value || null)}>
          <option value="">None</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        Inspect corridor
        <select value={edge?.id ?? ""} onChange={(event) => onSelect(event.target.value || null)}>
          <option value="">None</option>
          {[...runtime.network.edges.values()]
            .filter((e) => e.crossing || !e.from.startsWith("p:") || !e.to.startsWith("p:"))
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} {e.crossing ? "crossing" : "corridor"}
              </option>
            ))}
        </select>
      </label>
      {npc && (
        <dl>
          <dt>ID / status</dt>
          <dd>
            {npc.id} / {npc.status}
          </dd>
          <dt>Order</dt>
          <dd>{npc.order?.kind ?? "None"}</dd>
          <dt>Reason</dt>
          <dd>{npc.reason}</dd>
          <dt>Destination</dt>
          <dd>{npc.destination?.map((n) => n.toFixed(2)).join(", ") ?? "None"}</dd>
          <dt>Speed / radius</dt>
          <dd>
            {npc.pose.speed.toFixed(3)} / {npc.radius}
          </dd>
          <dt>Crossing</dt>
          <dd>{npc.crossing ?? "None"}</dd>
          <dt>Neighbors</dt>
          <dd>{npc.neighbors.join(", ") || "None"}</dd>
        </dl>
      )}
      {edge && (
        <dl>
          <dt>ID</dt>
          <dd>{edge.id}</dd>
          <dt>From / to</dt>
          <dd>
            {edge.from} / {edge.to}
          </dd>
          <dt>Length</dt>
          <dd>{edge.length.toFixed(3)}</dd>
          <dt>Traffic segments</dt>
          <dd>{edge.trafficSegments.join("; ") || "None"}</dd>
          <dt>Successors</dt>
          <dd>{(runtime.network.outgoing.get(edge.to) ?? []).map((e) => e.to).join("; ")}</dd>
        </dl>
      )}
      <p>
        {runtime.network.nodes.size} reachable nodes · {runtime.network.blocked.length} blocked
        samples. Escape clears diagnostic selection.
      </p>
    </fieldset>
  );
}
