# Accessibility

- **ACC-001:** All actions have semantic accessible names and work with keyboard alone.
- **ACC-002:** Focus is visible, logical, not trapped outside modal dialogs, and restored after dialogs close.
- **ACC-003:** Text and controls target WCAG 2.2 AA contrast; status is never communicated by color alone.
- **ACC-004:** Zone overlays pair stable colors with distinguishable patterns and a legend.
- **ACC-005:** Errors identify the field or object, the constraint, and a recovery action; progress has a textual stage and percentage.
- **ACC-006:** Motion respects `prefers-reduced-motion`; essential selection and validation feedback remains available without animation.
- **ACC-007:** The 3D canvas has a meaningful label and adjacent textual selection/diagnostic state.
- **ACC-008:** Dialogs use Radix primitives and require explicit confirmation only for genuinely destructive actions.

Manual QA covers Tab/Shift+Tab order, activation, shortcuts, Escape, focus restoration, contrast, patterns, zoom, and 1280×720 layout in Chrome and Edge.
