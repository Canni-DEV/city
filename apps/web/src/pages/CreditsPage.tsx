import { Panel } from "@city/ui";

const packs = [
  "City Kit Commercial 2.1",
  "City Kit Industrial 2.0",
  "City Kit Roads",
  "City Kit Suburban 2.0",
];

export function CreditsPage() {
  return (
    <div className="page narrow-page">
      <p className="eyebrow">Open assets</p>
      <h1>Credits and licenses</h1>
      <Panel className="credits-panel">
        <h2>Kenney city kits</h2>
        <p>
          All 213 source models are preserved in their original packs under the CC0 1.0 Universal
          dedication.
        </p>
        <ul>
          {packs.map((pack) => (
            <li key={pack}>{pack}</li>
          ))}
        </ul>
        <p>
          <a href="https://kenney.nl/" rel="noreferrer" target="_blank">
            Visit Kenney.nl
          </a>{" "}
          ·{" "}
          <a
            href="https://creativecommons.org/publicdomain/zero/1.0/"
            rel="noreferrer"
            target="_blank"
          >
            Read CC0 1.0
          </a>
        </p>
      </Panel>
      <p>City source code is licensed under the MIT License.</p>
    </div>
  );
}
