# M3.6.3 — NPC refactor

## IDs and approved inputs

Requirements: SIM-001–010 (amended), SIM-020–026, FUN-044, UX-026, DAT-008, AST-001/010, REN-009/010, AC-010/012, TST-006/008/009. Read [Simulation](../SIMULATION_SPEC.md), [Architecture](../ARCHITECTURE.md), [Data model](../DATA_MODEL.md), [Asset catalog](../ASSET_CATALOG.md), [UX](../UX_SPEC.md), [Rendering and performance](../RENDERING_AND_PERFORMANCE.md), [Testing](../TESTING.md), and [ADR-015](../adr/0015-npc-refactor.md). The owner approved this design for implementation on 2026-09-06, including the explicit amendments to earlier pedestrian restrictions. Branch: `milestone/m3-6-3-npc-refactor`.

## Outputs

- Derived shared pedestrian network: sidewalk corridors, complete crossings and reachable 0.1-cell park navigation around existing footprints. No generator or source asset changes.
- Continuous collision-checked motion, smooth turns, right preference, acceleration, seeded 0.33 cell/s ±10% walking and 1–3 second arrival pauses.
- Component collections and moveTo/wait orders with explicit outcomes. Safe crossing admission against predicted vehicles, one-second safety margin and alternate routing after ten seconds.
- Shared fixed 1/60 s clock and interpolated rendering; preserve backlog, pause while hidden, preserve surviving identities on population changes. Vehicle speed stays 1.85/3*2.
- Catalog character scale 0.75, idle/run blending, pedestrian network/NPC inspector and shared Pause/Resume/Step.

## Verification and stop

Run pnpm check, pnpm typecheck, pnpm test, pnpm build. TST-008 covers continuity, avoidance, orders, parks, crossings, determinism and runtime immutability; TST-006 checks scale, TST-009 protects vehicles. Run pnpm test:batch if occupancy or generator geometry changes. Record Chrome/Edge, WebGPU/WebGL 2, 1280×720/1920×1080, overlay off/on and 64+64 stress observations. Do not claim unperformed QA. Update requirements and evidence, then stop for review before M4.

## Evidence

Implementation complete, pending owner review. Final `pnpm check`, `pnpm typecheck`, `pnpm build`, and `git diff --check` pass. Build retains the existing large-chunk advisory. The owner requested that visual/functional QA be performed by them; browser verification was stopped before drawing conclusions. No Chrome/Edge, backend parity, FPS or stress acceptance is claimed.

Before that request, the full automated suite passed (core 69, assets 8, web 13 tests), and the three additional crossing regressions passed separately. Later final adjustments are checked statically; the suite was not rerun after the owner limited further verification to static checks. No occupancy/generator changes; no batch census was run.

## Lista de revisión manual para el propietario

Usar una ciudad nueva Balanced 96×96 con seed `green-crossroads`, inicialmente 12 peatones y 12 autos. Activar **Pedestrian navigation** para seleccionar un NPC y ver su recorrido; usar zoom o cámara libre **F** para observarlo cerca.

1. **Escala y apoyo:** NPC al 75% del tamaño anterior junto a puertas y autos. Pies sobre acera, cruce y césped, sin hundirse ni flotar.
2. **Movimiento:** seguir varias esquinas y una vuelta de 180°. No debe saltar de posición; la orientación debe cambiar gradualmente. Observar aceleración, frenado y llegada.
3. **Animación:** alternar caminata y pausas. Idle/run deben mezclarse sin golpes de pose ni reiniciar el ciclo. El clip sigue siendo el run original ralentizado.
4. **Encuentros:** aumentar peatones para observar sentidos opuestos, alcance de un NPC lento y convergencias. Deben preferir la derecha, desviarse o ceder sin atravesarse ni salir de la acera.
5. **Cruces:** observar calle local, avenida y acceso a rotonda. Esperar en la acera con tráfico próximo; cruzar hasta la otra acera con salida despejada. Los autos no frenan ni cambian de velocidad por los peatones.
6. **Espera prolongada:** con más autos, revisar el motivo de espera y comprobar que tras unos diez segundos intenta otra ruta al mismo destino cuando existe. No debe forzar el cruce.
7. **Parques:** comprobar entrada desde aceras, paseo por espacio libre y evasión de árboles/objetos. Regiones rojas bloqueadas no deben recibir destinos. No deben caminar por patios, lotes o interiores.
8. **Diagnóstico:** revisar corredores, flechas, accesos, obstáculos, ruta y radio del NPC seleccionado. Seleccionar NPC y corredor con teclado; Escape debe limpiar la selección. Apagar/encender ambos overlays por separado.
9. **Tiempo:** Pause debe detener peatones, autos y animaciones. Cada Step debe incrementar el contador un tick. Resume debe continuar sin saltos. Cambiar de pestaña y volver no debe recuperar de golpe el tiempo ausente.
10. **Población:** probar 0, 12 y 64 peatones/autos. Los NPC que permanecen no deben reiniciarse ni cambiar de identidad. Los aumentos de población esperan a que se liberen cruces ya admitidos; los cambios se aplican en ticks activos.
11. **Rendimiento y compatibilidad:** repetir a 1280×720 y 1920×1080, Chrome y Edge, WebGPU y `?forceWebGL=1` antes del hash. Registrar FPS con overlays apagados/encendidos y con 64+64; no inferir rendimiento de los chequeos estáticos.

Para informar un problema: seed, preset/tamaño, navegador/backend, cantidades, ID del NPC o corredor, motivo de espera y una captura o video. La revisión de órdenes `moveTo`/`wait` a nivel API está cubierta por pruebas de core; no hay controles para enviarlas desde la interfaz en este milestone.
