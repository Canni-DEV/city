# Product specification

## Vision

City is a modern browser-based creative sandbox for generating a convincing static city, watching a small number of people use its streets, and later reshaping objects. It emphasizes readable organic structure and playful authorship, not a large-scale simulator.

## Requirements

- **PRD-001:** Users can generate a new city from a name, text seed, preset, map size, and optional advanced controls.
- **PRD-002:** Users can edit generated buildings, vegetation, street furniture, and decoration without editing roads or zoning in v1.
- **PRD-003:** Users can manage multiple cities entirely in local browser storage and exchange readable `.city.json` files.
- **PRD-004:** The experience targets current Chrome and Edge on desktop at a minimum 1280×720 viewport.
- **PRD-005:** The presentation uses an orbital isometric camera, flat continuous terrain, irregular city edge, fixed daytime lighting, and no audio.
- **PRD-006:** The product has no goals, economy, vehicle traffic, accounts, server dependency, telemetry, onboarding, or PWA behavior. A bounded runtime pedestrian layer (SIM-001–010) is allowed; massive crowds are not.
- **PRD-007:** The interface is dark, English-only in v1, and makes zone meaning available through color and pattern.

## Success criteria

- **AC-001:** A 128×128 city generates in under five seconds on the reference modern integrated-GPU laptop.
- **AC-002:** A representative 1080p city sustains 60 FPS on the same class of device.
- **AC-003:** Equal generator version, seed, attempt, and parameters produce the same document hash.
- **AC-004:** M0–M6, intermediate M3.5/M3.6/M3.6.1, their mapped requirements, and all manual QA checks are complete before `1.0.0`.

## Out of scope for v1

Massive crowd or vehicle simulation, user-controlled avatars, walking lots/courtyards/park interiors, road editing, zoning editing, bridges, ramps, multilevel networks, multiplayer, cloud sync, mobile-first controls, seasons, time of day, audio, and heavy post-processing.
