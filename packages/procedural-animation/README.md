# Procedural NPC animation

Biblioteca TypeScript / Three y laboratorio Rapier para locomoción, interacción social procedural, ragdoll y recuperación sobre el rig Kenney. City conserva la autoridad sobre navegación, encuentros, hit detection y la decisión entre `stagger` y ragdoll.

## Probar

```sh
pnpm --filter @city/procedural-animation typecheck
pnpm --filter @city/procedural-animation test
pnpm --filter @city/procedural-animation build
pnpm --filter @city/web dev
```

El laboratorio integrado abre en `/dev/animations` durante desarrollo. Incluye perfiles, parámetros de marcha, beats, pausa/paso/reinicio, diagnóstico de esqueleto/IK y la prueba de carga de 50 NPC. La ruta y su tarjeta no existen en producción.

## API v2 por capas

La raíz está a nivel de los pies; +Y es arriba, +Z adelante. Las posiciones están en metros, el tiempo en segundos y los ángulos en radianes.

```ts
import { prepareCharacterRoot, ProceduralAnimator } from '@city/procedural-animation'

const prepared = prepareCharacterRoot(gltf, undefined, 1.8)
const animator = new ProceduralAnimator(prepared.group, prepared.pose, {
  seed: 42,
  style: .8,
  attentionResponse: 8,
  turnSpeed: Math.PI * 2 / 3,
})

animator.update(dt, {
  position: { x, y, z },
  facingYaw,
  velocity: { x: vx, y: vy, z: vz },
  grounded: true,
}, {
  attention: { target: otherHeadWorld },
  loop: speaking ? 'talk' : 'listen',
})

animator.playBeat({ type: 'point', target: landmarkWorld })
const request = animator.motionRequest // delta de este tick; no se acumula
```

La intención es declarativa: si `attention`, `loop` o `facingYaw` se omiten en el siguiente tick, ese canal vuelve a neutral con fundido. `talk` y `listen` se cancelan al moverse. `wave`, `point` y `nod` pueden mezclarse con la marcha; `punch`, `kick`, `stagger` y `sidestep` bloquean locomoción dirigida.

`status` informa locomoción, atención, loop, beat y giro por separado. `playBeat` devuelve `{ accepted, id, reason }`; un beat de mayor prioridad puede cancelar al activo. La prioridad es `stagger` > ataques > `sidestep` > gestos sociales. Un giro plantado puede pedir `translation` alrededor del pie pivote además de `yawDelta`; el director aplica o recorta ambos.

## Integración con física y City

```ts
import RAPIER from '@dimforge/rapier3d-compat'
import { createProceduralCharacter } from '@city/procedural-animation/physics'

const npc = await createProceduralCharacter({
  gltf, world, rapier: RAPIER, height: 1.8, movement: false,
})

npc.onEvent(event => {
  if (event.type === 'actionContact') {
    // City usa origin/point/direction/reach/radius para resolver la víctima.
    // Después elige stagger o knockdown; el evento no representa daño.
  }
})

function fixedTick(dt: number) {
  const request = npc.motionRequest
  // Validar request contra navegación/cápsulas y aplicar lo aceptado a x/z/facingYaw.
  npc.beforePhysics(dt, {
    position: { x, y, z }, facingYaw,
    velocity: { x: vx, y: vy, z: vz }, grounded,
  }, {
    attention: { target: partnerHead },
    loop: 'listen',
  })
  world.step()
  npc.afterPhysics(dt)
}

npc.playBeat({ type: 'stagger', direction: awayFromAttacker, intensity: .6 })
npc.playBeat({ type: 'sidestep', direction: freeSide, distance: .5 })
npc.knockdown({ impulse, point })
```

Cada `MotionRequest` contiene `translation`, `yawDelta` y `source`. El director puede aceptarlo, recortarlo o ignorarlo; la siguiente `MotionSample` real reconcilia la animación sin deuda pendiente. Para el controlador Rapier opcional de la demo, la propia fachada aplica la solicitud mediante el character controller.

Durante ragdoll la física tiene autoridad. Ragdoll cancela los canales activos; `gettingUp` rechaza beats. Al recibir `recoveryCompleted`, City debe adoptar `position` y `facingYaw` y recalcular la ruta. Para un vehículo físico, activar ragdoll sin impulso duplicado; para un evento sin contacto físico, proporcionar el impulso calculado por City.

## Migración desde 0.1

- `MotionSample.yaw` pasa a `facingYaw`.
- `playAction('kick')` pasa a `playBeat({ type: 'kick' })`.
- El estado plano se reemplaza por `status` compuesto.
- `movementLocked` pasa a `status.locomotionBlocked`.
- Los booleanos `punch`, `kick` y `wave` salen de `CharacterInput`; los beats se disparan explícitamente.
- `stateChanged` pasa a eventos de ciclo de beat y `physicsChanged`.
- `actionContact` expone geometría e intensidad sugerida, pero continúa sin resolver daño.

No hay shim de compatibilidad con 0.1.

## Límites y revisión

Se soporta el rig Kenney actual, no humanoides arbitrarios. No hay dedos, objetos, cara, high-five, apretón, bloqueo, esquiva ni sincronización labial. Los parámetros de interacción y marcha tienen defaults seguros y overrides parciales por instancia; `seed` y `style` aportan variación determinista.

La revisión manual está descrita en `REVIEW.md`. La carga debe sostener 60 FPS con 50 NPC y un p95 de animación de hasta 4 ms en el equipo de revisión; la demo exporta ambos datos, pero el resultado depende del hardware y no se certifica automáticamente.
