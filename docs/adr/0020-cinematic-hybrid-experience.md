# ADR-0020: Hybrid DOM/R3F cinematic experience

## Context

City needs an optional narrative route that initially reads as a conventional technical page, then reveals a real generated city through scroll. Rendering the copy inside WebGL would weaken text fidelity, keyboard navigation, responsive layout and reduced-motion support. Treating the city as a decorative model would violate `CityDocumentV1` authority and make handoff to NPC control discontinuous.

## Decision

Use semantic HTML and an inline vector wordmark above a fixed React Three Fiber canvas. Native document scroll drives pure camera and mask progress; the cinematic route owns a perspective camera with no user controls. The canvas renders the same scene derived from a locally generated `CityDocumentV1`. Only explicit activation adopts that exact document into the application store, after which normal City rendering reconstructs runtime state and validates a transient stable NPC ID.

The experience is a production route but remains unlinked and outside the normal topbar. It is not onboarding and does not replace the library. Small viewports skip generation; reduced-motion users receive a static final composition.

## Consequences

Text, focus and fallback behavior remain browser-native, while the scene retains renderer parity and document authority. The handoff rebuilds disposable Canvas/runtime objects behind a short transition instead of keeping one Canvas alive across routes. Scroll, camera, greeting and entry state are never persisted or hashed.
