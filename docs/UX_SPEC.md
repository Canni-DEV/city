# UX specification

## Structure

- **UX-001:** The library is the entry point; the city route combines a dominant 3D viewport with generator/editor controls.
- **UX-002:** The credits page names Kenney, the four packs, their links, CC0, and the MIT code license.
- **UX-003:** The asset viewer is discoverable only in development builds.
- **UX-004:** Status messages use plain language and identify actionable validation failures.

## Camera and input

- **UX-010:** Left click selects; left-drag on empty ground pans; Shift+drag performs rectangle selection.
- **UX-011:** Right-drag orbits, wheel zooms, and Q/E rotates the camera.
- **UX-012:** Delete removes; Ctrl/Cmd+Z undoes; Shift+Ctrl/Cmd+Z redoes; Ctrl/Cmd+D duplicates; Escape cancels.
- **UX-013:** Continuous transforms preview live but commit as one history command.

## Feedback

- **UX-020:** Selection has a visible outline and a non-instanced proxy for the gizmo.
- **UX-021:** Invalid placement keeps the last valid transform and explains the collision or boundary constraint.
- **UX-022:** Zone incompatibility is a non-blocking warning.
- **UX-023:** Destructive library and block-regeneration actions require explicit confirmation.
- **UX-024:** The technical diagnostic exposes Auto/Low/Medium/High quality and active WebGPU or WebGL 2 backend.

M3 implements that diagnostic in the city laboratory, including a quality selector, backend notice, frame-rate/draw-call readouts, and a textual selection status. Object editing remains M4.

## Layout

The supported minimum is 1280×720. Panels may collapse as space narrows but the viewport, current mode, primary action, and cancellation path remain available. There is no onboarding; empty states teach the next action in one sentence.

Zone, lot, and grid overlays are independently toggleable and do not mutate the document. Zone meaning uses a stable color, a repeating pattern, and a legend of actual versus target area shares.
