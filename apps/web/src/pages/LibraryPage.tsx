import { Button, Panel } from "@city/ui";
import { ArrowRight, MapIcon, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function LibraryPage() {
  const navigate = useNavigate();
  return (
    <div className="page library-page">
      <section className="hero">
        <p className="eyebrow">Your local city library</p>
        <h1>Shape a city that feels grown, not stamped out.</h1>
        <p className="lede">
          Generate an organic street network, then turn every block into your own miniature place.
        </p>
        <Button variant="primary" onClick={() => navigate("/city/new")}>
          Start a city <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </section>
      <section className="library-grid" aria-label="City library">
        <Panel className="empty-library">
          <MapIcon size={34} aria-hidden="true" />
          <h2>No cities yet</h2>
          <p>
            The local library and persistence arrive in milestone M5. This foundation already fixes
            its contracts and flow.
          </p>
        </Panel>
        <Panel className="status-card">
          <Sparkles size={24} aria-hidden="true" />
          <div>
            <span className="status-pill">M3</span>
            <h2>Placement and rendering</h2>
          </div>
          <p>
            Buildings, parks, decoration, instanced rendering, quality profiles, and a one-time
            WebGPU to WebGL 2 fallback.
          </p>
        </Panel>
      </section>
    </div>
  );
}
