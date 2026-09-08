# Lista de revisión interactiva

Ejecutar `pnpm --filter @city/web dev` y abrir `/dev/animations`.

- [ ] **Reposo:** rodillas ligeramente flexionadas, manos fuera del torso, respiración sutil. Revisar frente, perfil y tres cuartos.
- [ ] **Transferencia de peso:** en idle, el apoyo debe cambiar cada pocos segundos sin deslizar los pies ni mover la raíz.
- [ ] **LookAt y giro:** un objetivo a 90° debe girar pecho/cabeza con tope; tras ~0,2 s en reposo, giro plantado hasta quedar de frente. Al caminar, solo pecho/cabeza.
- [ ] **Velocidad:** mover a 0,3 / 1,5 / 3 / 4,5 m/s. Revisar longitud de paso, flexión de rodillas, balanceo de brazos y deslizamiento de pies.
- [ ] **Cambios:** arrancar, frenar y girar 90° / 180°. Revisar apoyos y transición a carrera.
- [ ] **Terreno:** subir/bajar rampa y escalones; saltar desde plataforma. Buscar penetración de pies, piernas estiradas y pelvis demasiado alta/baja.
- [ ] **Puño:** verificar trayectoria frontal a altura del torso/cabeza, preparación y retorno, un solo evento actionContact.
- [ ] **Patada:** verificar rodilla arriba, extensión al torso, pie de apoyo y retorno sin salto de pose.
- [ ] **Talk/listen:** en el encuentro, gestos de brazos al hablar y carga de una pierna al escuchar; se cortan al andar.
- [ ] **Point/nod:** señalar elige el brazo del lado del objetivo; el asentimiento funciona parado y andando.
- [ ] **Stagger/sidestep:** un golpe leve recula sin derribar; el segundo par cede el paso. Un rechazo del director no debe empujar después.
- [ ] **Encuentro:** acercamiento, parada, giro, turnos de conversación, point/nod, patada con stagger y sidestep. Debe repetir cada 20 s.
- [ ] **Ragdoll prioritario:** impactos frente/lado/atrás a 50 / 100 / 250 N·s, quieto y corriendo. Buscar estiramientos, torsiones extrañas, vibración o miembros atravesando el suelo.
- [ ] **Vehículo:** lanzar a 4 / 8 / 15 m/s. Revisar primer contacto, continuidad del movimiento y colisiones posteriores.
- [ ] **Reposo y recuperación:** pedir levantarse inmediatamente (debe bloquear); repetir cuando se estabilice. Probar boca arriba, boca abajo, elevado y cerca de obstáculos. Revisar apoyo de manos y rodillas, altura final y ausencia de teleport visible.
- [ ] **Interrupción:** impactar durante puño, patada y recuperación. Debe volver a física desde la pose actual.
- [ ] **Diagnóstico:** pausar y activar huesos/IK/física. Confirmar coincidencia razonable entre colliders y miembros.
- [ ] **Carga:** activar 50 NPC / 5 ragdolls, dejar 30 segundos, exportar medición y anotar CPU/GPU y resolución. Objetivo 60 FPS, pendiente de confirmar.
- [ ] **Reinicio:** repetir carga/reinicio; confirmar que no se duplican personajes ni persisten cuerpos viejos.

## Atención especial

- Una caída sin impulso puede mantener movimiento residual y retrasar «Levantarse». Registrar dirección/pose y segundos de espera si ocurre.
- Los topes articulares blandos necesitan revisión con impactos grandes. No dar por cerrado el ragdoll solo porque pase la prueba automática.
- La recuperación es una primera secuencia procedural; revisar especialmente el paso de la pose caída a los apoyos.
- La revisión M3.8 debe registrar por separado el laboratorio y el viewport de City a 12 y 64 NPCs.

Para reportar un problema: indicar acción, velocidad/impulso, dirección, terreno y, si es posible, una captura o video corto. Usar pausa y un paso para aislar la pose.
