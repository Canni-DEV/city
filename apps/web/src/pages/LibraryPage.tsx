import { Button, Panel } from "@city/ui";
import { ArrowRight, MapIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function LibraryPage() {
  const navigate = useNavigate();
  return (
    <div className="page library-page">
      <section className="hero">
        <p className="eyebrow">Sandbox</p>
        <h1>City</h1>
        <Button variant="primary" onClick={() => navigate("/city/new")}>
          Generate <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </section>
      <section className="library-grid" aria-label="Saved cities">
        <Panel className="empty-library">
          <MapIcon size={34} aria-hidden="true" />
          <h2>No saved cities.</h2>
        </Panel>
      </section>
    </div>
  );
}
