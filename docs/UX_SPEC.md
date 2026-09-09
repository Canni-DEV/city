# UX specification

## Structure

- **UX-001:** The library is the entry point; the city route combines a dominant 3D viewport with generation and diagnostic controls. Visible chrome uses laboratory labels (Generate, Parameters, Seed, Size), not product marketing or editor voice.
- **UX-002:** The credits page names Kenney, the five packs (four City Kits plus Animated Characters Protagonists), their links, CC0, and the MIT code license.
- **UX-003:** The asset viewer is discoverable only in development builds.
- **UX-004:** Status messages use plain language and identify actionable validation failures.

## Camera and input

- **UX-010:** Left click selects; left-drag on empty ground pans; Shift+drag performs rectangle selection.
- **UX-011:** Right-drag orbits, wheel zooms, and Q/E rotates the camera. Default framing still shows the whole city; OrbitControls `maxZoom` is `96` so streets and agents can be inspected at sidewalk scale. **F** toggles unrestricted free flight only outside NPC control. M3.8 adds an explicit perspective `npcFollow` mode while controlling a selected NPC; M3.8.1 makes that mode a locked third-person follow behind the NPC yaw, with right-drag/Q/E look that springs back on release or movement. Tab returns to city orbit and Escape releases control, clears selection, and returns to city orbit.
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

- **UX-026:** Pedestrian navigation defaults off. Blue corridors/arrows, pink crossings/wait points, green park samples, amber accesses, gray obstacles, red blocked areas and lime selected route/body circles include a textual legend. Keyboard or the always-available control selector selects NPCs. Inspector includes control, animation, attention, crossing-run and deferred-action state. Pause/Resume and Step affect traffic and procedural animation together. Runtime manual control and follow camera are allowed by UX-027; editor orders remain out of scope.
- **UX-027:** Every visible NPC has an enlarged invisible pick target and stable-ID selector. Selection highlights the avatar and announces accessible status without changing autonomy/camera. Explicit Control enters camera-relative WASD/arrow control and locked third-person `npcFollow` (behind/above the interpolated hip, wheel distance `1.2…8`). Right-drag and Q/E look around the actor; releasing the right button or starting movement springs the view back behind while keeping wheel distance. Shift runs, V greets, X/Stop holds, Tab releases while preserving selection, Escape releases and clears, and F is ignored during control. Keyboard handling excludes editable controls and clears held keys on blur or mode changes. Development home exposes an Animation lab card; production does not.
