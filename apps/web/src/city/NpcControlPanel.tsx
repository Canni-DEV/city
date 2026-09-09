import { greetNpc, npcDiagnostics, stopNpc } from "@city/core";
import { useEffect, useState } from "react";
import type { SimulationRuntime } from "./simulation-runtime";

export function NpcControlPanel({
  runtime,
  selected,
  controlled,
  onSelect,
  onControl,
  onRelease,
}: {
  runtime: SimulationRuntime;
  selected: string | null;
  controlled: string | null;
  onSelect: (id: string | null) => void;
  onControl: (id: string) => void;
  onRelease: () => void;
}) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => refresh((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const agents = npcDiagnostics(runtime.world),
    npc = agents.find((candidate) => candidate.id === selected);

  return (
    <fieldset className="overlay-controls npc-controls">
      <legend>NPC control</legend>
      <label>
        Selected NPC
        <select value={npc?.id ?? ""} onChange={(event) => onSelect(event.target.value || null)}>
          <option value="">None</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.id}
            </option>
          ))}
        </select>
      </label>
      <div className="npc-control-actions">
        {npc && controlled !== npc.id && (
          <button type="button" className="city-button" onClick={() => onControl(npc.id)}>
            Control NPC
          </button>
        )}
        {npc && controlled === npc.id && (
          <button type="button" className="city-button" onClick={onRelease}>
            Return to city
          </button>
        )}
        <button
          type="button"
          className="city-button"
          disabled={!npc}
          onClick={() => npc && stopNpc(runtime.world, npc.id)}
        >
          Stop (X)
        </button>
        <button
          type="button"
          className="city-button"
          disabled={!npc}
          onClick={() => npc && greetNpc(runtime.world, npc.id)}
        >
          Greet (V)
        </button>
      </div>
      <p className="selection-status" aria-live="polite">
        {npc
          ? `${npc.id}: ${npc.controlMode}, ${npc.animationPhase}. ${npc.reason}`
          : "Select an NPC in the viewport or list."}
      </p>
      {controlled === npc?.id && (
        <p className="selection-status" role="status">
          WASD or arrows move, Shift runs, V greets, X stops. Right-drag looks, wheel zooms, Q/E
          turns the view. Tab returns to the city camera.
        </p>
      )}
    </fieldset>
  );
}
