import { Panel } from "@city/ui";
import { Construction } from "lucide-react";
import { useParams } from "react-router-dom";

export function CityPage() {
  const { cityId } = useParams();
  return (
    <div className="page centered-page">
      <Panel className="milestone-placeholder">
        <Construction size={40} aria-hidden="true" />
        <p className="eyebrow">City {cityId}</p>
        <h1>The ground is surveyed.</h1>
        <p>
          Road generation begins in M1. M0 intentionally stops at this navigable, contract-backed
          shell.
        </p>
      </Panel>
    </div>
  );
}
