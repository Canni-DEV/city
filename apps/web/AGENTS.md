# Web application instructions

Own routes, feature composition, persistence adapters, workers, and rendering. Domain mutation goes through `@city/core`; the rendered scene is derived from `CityDocumentV1`. Prefer instancing by asset and variant, preserve stable entity-to-instance mappings, and keep WebGPU/WebGL 2 parity. Development-only routes must not ship. Validate keyboard flows and both backends for user-visible changes. Update UX, rendering, persistence, deployment, and testing documents as applicable.
