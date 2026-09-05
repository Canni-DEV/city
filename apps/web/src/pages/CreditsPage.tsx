import { Panel } from "@city/ui";

const packs = [
  { name: "City Kit Commercial 2.1", href: "https://kenney.nl/assets/city-kit-commercial" },
  { name: "City Kit Industrial 2.0", href: "https://kenney.nl/assets/city-kit-industrial" },
  { name: "City Kit Roads", href: "https://kenney.nl/assets/city-kit-roads" },
  { name: "City Kit Suburban 2.0", href: "https://kenney.nl/assets/city-kit-suburban" },
  {
    name: "Animated Characters Protagonists 1.1",
    href: "https://kenney.nl/assets/animated-characters-protagonists",
  },
];

export function CreditsPage() {
  return (
    <div className="page narrow-page">
      <p className="eyebrow">Open assets</p>
      <h1>Credits and licenses</h1>
      <Panel className="credits-panel">
        <h2>Kenney packs</h2>
        <p>
          City uses five Kenney packs. The four City Kits contribute 213 source models; Animated
          Characters Protagonists 1.1 supplies the pedestrian body, clips, and skins. Original files
          remain under the CC0 1.0 Universal dedication.
        </p>
        <ul>
          {packs.map((pack) => (
            <li key={pack.name}>
              <a href={pack.href} rel="noreferrer" target="_blank">
                {pack.name}
              </a>
            </li>
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
