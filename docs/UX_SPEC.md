# UX specification

## Structure

- **UX-001:** The library is the entry point; the city route combines a dominant 3D viewport with generation and diagnostic controls. Visible chrome uses laboratory labels (Generate, Parameters, Seed, Size), not product marketing or editor voice.
- **UX-002:** The credits page names Kenney, the five packs (four City Kits plus Animated Characters Protagonists), their links, CC0, and the MIT code license.
- **UX-003:** The asset viewer is discoverable only in development builds.
- **UX-004:** Status messages use plain language and identify actionable validation failures.

## Camera and input

- **UX-010:** Left click selects; left-drag on empty ground pans; Shift+drag performs rectangle selection.
- **UX-011:** Right-drag orbits, wheel zooms, and Q/E rotates the camera. Default framing still shows the whole city; OrbitControls `maxZoom` is raised above 28 in M3.6 so streets and agents can be inspected. **F** toggles an optional unrestricted free camera (perspective, WASD, right-drag look, no zoom/distance clamps). Escape or **F** returns to the default city view. Free camera is inspect-only; it is not a player avatar.
- **UX-012:** Delete removes; Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes; Ctrl/Cmd+D duplicates; Escape cancels the current editor gesture and also clears Traffic lanes and Pedestrian navigation diagnostic selection (UX-025/026).
- **UX-013:** Continuous transforms preview live but commit as one history command.

## Feedback

- **UX-020:** Selection has a visible outline and a non-instanced proxy for the gizmo.
- **UX-021:** Invalid placement keeps the last valid transform and explains the collision or boundary constraint.
- **UX-022:** Zone incompatibility is a non-blocking warning.
- **UX-023:** Destructive library and block-regeneration actions require explicit confirmation.
- **UX-024:** The technical diagnostic exposes Auto/Low/Medium/High quality and active WebGPU or WebGL 2 backend. Pedestrian and vehicle sliders (0–64) override the quality-derived defaults immediately without mutating the document. The primary Generate control uses near-black text on the lime accent fill.

M3 implements that diagnostic in the city laboratory, including a quality selector, backend notice, frame-rate/draw-call readouts, and a textual selection status. Object editing remains M4. M3.6 adds runtime pedestrians; they are not editor selection targets. M3.6.1 keeps them on sidewalks; sidewalk tiles are not editor selection targets. M3.6.2 adds runtime vehicles on the directed lane network; they are not editor selection targets. Traffic lanes diagnostic selection (UX-025) does not select vehicles or enable road editing.

## Layout

The supported minimum is 1280×720. Panels may collapse as space narrows but the viewport, current mode, primary action, and cancellation path remain available. The city workspace is a two-column grid whose viewport track is a definite `minmax(0, 1fr)` cell so the 3D canvas has a containing block on first paint. There is no onboarding; empty states teach the next action in one sentence.

Zone, lot, grid, Traffic lanes and Pedestrian navigation overlays are independently toggleable and do not mutate the document. Zone meaning uses a stable color, a repeating pattern, and a legend of actual versus target area shares.

- **UX-025:** Traffic lanes defaults off in Map overlays. Solid cyan lanes, dashed amber maneuvers/joins, purple roundabout ring, white direction arrows, gray carriageway boundaries, lime portal marks, pink crossing marks, and red invalid movements use a textual legend (not color alone). A keyboard-accessible segment selector exposes ID, class, movement, length, from/to, source tiles, successors, crossing IDs, and validation. Escape clears diagnostic selection. Selection does not edit roads or pick vehicles. No pause, step, or follow-vehicle controls.

- **UX-026:** Pedestrian navigation defaults off. Blue corridors/arrows, pink crossings/wait points, green park samples, amber accesses, gray obstacles, red blocked areas and lime selected route/body circles include a textual legend. Keyboard selects NPCs or corridors. Inspector shows ID, status, order, reason, goal, speed, radius, crossing, neighbors and connectivity. Pause/Resume and Step affect both traffic layers and animation; Step requires pause. Escape clears selection. No manual order entry, editing or follow camera.
