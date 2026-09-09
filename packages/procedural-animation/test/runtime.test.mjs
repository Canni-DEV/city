import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { Bone, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createAnimatedCharacter,
  FixedClock,
  ProceduralAnimator,
  prepareCharacterRoot,
  solveTwoBoneIK,
} from "../dist/index.js";
import { createProceduralCharacter, GROUND_GROUPS } from "../dist/physics.js";

await RAPIER.init();
const bytes = await readFile(
  new URL("../../assets/generated/characters/character-medium.glb", import.meta.url),
);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  "",
);
function worldAt(y = 0) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.numSolverIterations = 8;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(30, 0.2, 30)
      .setTranslation(0, y - 0.2, 0)
      .setCollisionGroups(GROUND_GROUPS),
    body,
  );
  world.step();
  return world;
}
const sample = (speed = 0, z = 0) => ({
  position: { x: 0, y: 0, z },
  facingYaw: 0,
  velocity: { x: 0, y: 0, z: speed },
  grounded: true,
});
const tick = (c, w, n = 1) => {
  for (let i = 0; i < n; i++) {
    c.beforePhysics(1 / 60);
    w.step();
    c.afterPhysics(1 / 60);
  }
};

test("clock: identical 60 Hz steps at 30 / 60 / 120 FPS, backlog preserved", () => {
  for (const fps of [30, 60, 120]) {
    const c = new FixedClock();
    let n = 0;
    for (let i = 0; i < fps * 5; i++) c.advance(1 / fps, () => n++);
    assert.equal(n, 300);
  }
  const c = new FixedClock();
  let n = 0;
  c.advance(1, () => n++);
  for (let i = 0; i < 5; i++) c.advance(0, () => n++);
  assert.equal(n, 60);
});
test("IK: reachable targets, unreachable targets and pole singularity remain finite", () => {
  const a = new Bone(),
    b = new Bone(),
    c = new Bone();
  a.add(b);
  b.add(c);
  b.position.y = 1;
  c.position.y = 1;
  for (const target of [new Vector3(0.5, 1.3, 0.2), new Vector3(0, 5, 0), new Vector3(0, 0, 0)]) {
    solveTwoBoneIK(a, b, c, target, new Vector3(0, 0, 1));
    a.updateWorldMatrix(true, true);
    const p = c.getWorldPosition(new Vector3());
    assert.ok(p.toArray().every(Number.isFinite));
    assert.ok(p.length() <= 2.001);
  }
});
test("clones isolate bones and preserve source scale/materials; scale validation", () => {
  const a = prepareCharacterRoot(gltf, undefined, 1.8),
    b = prepareCharacterRoot(gltf, undefined, 1.2);
  const before = b.pose.require("Head").quaternion.clone();
  a.pose.require("Head").rotation.x += 0.5;
  assert.ok(b.pose.require("Head").quaternion.equals(before));
  assert.notEqual(a.mesh.skeleton, b.mesh.skeleton);
  assert.equal(a.mesh.geometry, b.mesh.geometry);
  a.group.scale.set(1, 2, 1);
  assert.throws(() => new ProceduralAnimator(a.group, a.pose), /uniform/);
  a.dispose();
  b.dispose();
});
test("attacks emit one contact and reach forward / torso height", () => {
  for (const action of ["punch", "kick"]) {
    const p = prepareCharacterRoot(gltf, undefined, 1.8),
      events = [];
    const animator = new ProceduralAnimator(p.group, p.pose, {}, (e) => events.push(e));
    animator.update(1 / 60, sample());
    assert.ok(animator.playBeat({ type: action }).accepted);
    for (let i = 0; i < 90; i++) animator.update(1 / 60, sample());
    const contacts = events.filter((e) => e.type === "actionContact");
    assert.equal(contacts.length, 1);
    assert.ok(contacts[0].point.z > 0.25, JSON.stringify(contacts));
    assert.ok(contacts[0].point.y > (action === "kick" ? 0.65 : 1), JSON.stringify(contacts));
    const types = events.map((e) => e.type);
    assert.ok(types.indexOf("beatStarted") < types.indexOf("actionContact"));
    assert.ok(types.indexOf("actionContact") < types.indexOf("beatCompleted"));
    assert.equal(contacts[0].id, events.find((e) => e.type === "beatStarted").id);
    assert.ok(contacts[0].reach > 0.2);
    assert.ok(
      Math.abs(
        Math.hypot(contacts[0].direction.x, contacts[0].direction.y, contacts[0].direction.z) - 1,
      ) < 1e-5,
    );
    assert.ok(contacts[0].radius > 0 && contacts[0].intensity > 0);
    p.dispose();
  }
});

test("v2 layers are declarative and attention only requests planted turns", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose, { seed: 7 });
  const intent = { attention: { target: { x: 10, y: 1.6, z: 0 } }, loop: "talk" };
  for (let i = 0; i < 30; i++) a.update(1 / 60, sample(), intent);
  assert.equal(a.status.attention, "tracking");
  assert.equal(a.status.loop, "talk");
  assert.equal(a.status.turning, true);
  assert.equal(a.motionRequest.source, "turn");
  a.update(1 / 60, sample(1, 0), intent);
  assert.equal(a.status.turning, false);
  assert.equal(a.motionRequest, null);
  for (let i = 0; i < 120; i++) a.update(1 / 60, sample());
  assert.equal(a.status.attention, "neutral");
  assert.equal(a.status.loop, null);
  p.dispose();
});

test("v2 beat priorities, lifecycle events and motion requests are deterministic", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    events = [];
  const a = new ProceduralAnimator(p.group, p.pose, { seed: 11 }, (event) => events.push(event));
  a.update(1 / 60, sample());
  const wave = a.playBeat({ type: "wave" });
  assert.ok(wave.accepted);
  const punch = a.playBeat({ type: "punch" });
  assert.ok(punch.accepted);
  assert.equal(events.find((e) => e.type === "beatCancelled").id, wave.id);
  assert.equal(a.playBeat({ type: "nod" }).reason, "busy");
  const stagger = a.playBeat({ type: "stagger", direction: { x: 1, y: 0, z: 0 }, intensity: 0.75 });
  assert.ok(stagger.accepted);
  a.update(1 / 60, sample());
  assert.equal(a.motionRequest.source, "stagger");
  assert.ok(a.motionRequest.translation.x > 0);
  assert.deepEqual(a.status.beat, { id: stagger.id, type: "stagger" });
  for (let i = 0; i < 90; i++) a.update(1 / 60, sample());
  assert.equal(a.status.beat, null);
  assert.ok(events.some((e) => e.type === "beatCompleted" && e.id === stagger.id));
  p.dispose();
});

test("point, nod and sidestep stay finite and social beats can coexist with walking", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose);
  a.update(1 / 60, sample(1));
  assert.ok(a.playBeat({ type: "point", target: { x: 4, y: 1.2, z: 3 }, arm: "auto" }).accepted);
  for (let i = 0; i < 80; i++) a.update(1 / 60, sample(1, i / 60));
  assert.equal(a.status.locomotion, "walk");
  assert.ok(
    [...p.pose.nodes.values()].every((node) => node.quaternion.toArray().every(Number.isFinite)),
  );
  assert.ok(a.playBeat({ type: "nod" }).accepted);
  for (let i = 0; i < 60; i++) a.update(1 / 60, sample(1, 2 + i / 60));
  assert.ok(
    a.playBeat({ type: "sidestep", direction: { x: -1, y: 0, z: 0 }, distance: 99 }).accepted,
  );
  let distance = 0;
  for (let i = 0; i < 60; i++) {
    a.update(1 / 60, sample());
    distance += Math.abs(a.motionRequest?.translation.x ?? 0);
  }
  assert.ok(distance <= a.rig.height * 0.451 && distance >= a.rig.height * 0.44);
  p.dispose();
});

const yawOf = (pose, root, name) => {
  const local = root
    .getWorldQuaternion(new Quaternion())
    .invert()
    .multiply(pose.require(name).getWorldQuaternion(new Quaternion()));
  const forward = new Vector3(0, 0, 1).applyQuaternion(local);
  return Math.atan2(forward.x, forward.z);
};
const poseSig = (pose) =>
  ["Chest", "Head", "LeftArm", "RightArm"]
    .map((name) =>
      pose
        .require(name)
        .quaternion.toArray()
        .map((v) => v.toFixed(5))
        .join(","),
    )
    .join("|");
const finitePose = (pose) => {
  for (const node of pose.nodes.values()) {
    assert.ok(node.position.toArray().every(Number.isFinite));
    assert.ok(node.quaternion.toArray().every(Number.isFinite));
    assert.ok(Math.abs(node.quaternion.length() - 1) < 1e-4);
  }
};
const wrapAngle = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const applyRequest = (motion, request) =>
  request
    ? {
        ...motion,
        position: {
          x: motion.position.x + request.translation.x,
          y: motion.position.y + request.translation.y,
          z: motion.position.z + request.translation.z,
        },
        facingYaw: motion.facingYaw + request.yawDelta,
        velocity: { x: 0, y: 0, z: 0 },
      }
    : { ...motion, velocity: { x: 0, y: 0, z: 0 } };

test("v2 status, invalid beats and omitted channels cancel with a fade", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose, { seed: 2 });
  a.update(1 / 60, sample());
  assert.deepEqual(
    { ...a.status },
    { locomotion: "idle", attention: "neutral", loop: null, beat: null, turning: false },
  );
  assert.equal(
    a.playBeat({ type: "stagger", direction: { x: 0, y: 1, z: 0 }, intensity: 1 }).reason,
    "invalid",
  );
  assert.equal(a.playBeat({ type: "point", target: { x: NaN, y: 0, z: 0 } }).reason, "invalid");
  a.update(1 / 60, { ...sample(), grounded: false });
  assert.equal(a.playBeat({ type: "wave" }).reason, "airborne");
  a.update(1 / 60, sample());
  const nod = a.playBeat({ type: "nod" });
  assert.equal(nod.accepted, true);
  assert.equal(typeof nod.id, "number");
  for (let i = 0; i < 20; i++)
    a.update(1 / 60, sample(), { loop: "talk", attention: { target: { x: 2, y: 1.5, z: 2 } } });
  assert.equal(a.status.loop, "talk");
  assert.equal(a.status.attention, "tracking");
  for (let i = 0; i < 16; i++) a.update(1 / 60, sample());
  assert.equal(a.status.loop, null);
  assert.equal(a.interactionParameters.sidestepDuration, 0.75);
  p.dispose();
});

test("lookAt clamps head and chest, delays planted turns, and stays upper-body while walking", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose, { seed: 3 });
  const intent = { attention: { target: { x: 8, y: 1.6, z: 0 } } };
  a.update(1 / 60, sample());
  const chest0 = yawOf(p.pose, p.group, "Chest"),
    head0 = yawOf(p.pose, p.group, "Head");
  a.update(1 / 60, sample(), intent);
  assert.equal(a.status.turning, false);
  assert.ok(Math.abs(yawOf(p.pose, p.group, "Chest") - chest0) < (8 * Math.PI) / 180);
  let motion = sample();
  for (let i = 0; i < 10; i++) {
    a.update(1 / 60, motion, intent);
    motion = applyRequest(motion, a.motionRequest);
    assert.equal(a.status.turning, false);
  }
  let sawTurn = false,
    chest = 0,
    head = 0;
  for (let i = 0; i < 50; i++) {
    a.update(1 / 60, motion, intent);
    if (a.status.turning) {
      sawTurn = true;
      chest = Math.abs(yawOf(p.pose, p.group, "Chest") - chest0);
      head = Math.abs(yawOf(p.pose, p.group, "Head") - head0);
      assert.ok(Math.abs(a.motionRequest.yawDelta) <= (Math.PI * 2) / 3 / 60 + 1e-6);
    }
    motion = applyRequest(motion, a.motionRequest);
  }
  assert.ok(sawTurn);
  assert.ok(chest <= (25 * Math.PI) / 180 + 0.08, chest);
  assert.ok(Math.abs(head - chest) <= (45 * Math.PI) / 180 + 0.08, { head, chest });
  a.update(1 / 60, sample(), { attention: { target: { x: 1e8, y: -1e8, z: 1e8 } } });
  finitePose(p.pose);
  const walking = prepareCharacterRoot(gltf, undefined, 1.8),
    b = new ProceduralAnimator(walking.group, walking.pose);
  for (let i = 0; i < 40; i++) b.update(1 / 60, sample(1.5, (i * 1.5) / 60), intent);
  assert.equal(b.status.turning, false);
  assert.equal(b.motionRequest, null);
  p.dispose();
  walking.dispose();
});

test("planted turn keeps a pivot foot and finishes inside 3 degrees", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose);
  const intent = { facingYaw: Math.PI / 2, attention: { target: { x: 6, y: 1.5, z: 0 } } };
  let motion = sample();
  a.update(1 / 60, motion, intent);
  motion = applyRequest(motion, a.motionRequest);
  const origin = a.feet.map((foot) => foot.target.clone());
  const plantedFrames = [0, 0];
  for (let i = 0; i < 90; i++) {
    a.update(1 / 60, motion, intent);
    for (let j = 0; j < 2; j++)
      if (a.feet[j].planted && a.feet[j].target.distanceTo(origin[j]) < 1e-9) plantedFrames[j]++;
    motion = applyRequest(motion, a.motionRequest);
    finitePose(p.pose);
  }
  assert.ok(Math.max(...plantedFrames) > 40, plantedFrames);
  assert.equal(a.status.turning, false);
  assert.ok(
    Math.abs(wrapAngle(motion.facingYaw, Math.PI / 2)) <= Math.PI / 60 + 1e-3,
    motion.facingYaw,
  );
  p.dispose();
});

test("idle weight transfer does not slide planted feet or move the root", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose, { seed: 8 });
  a.update(1 / 60, sample());
  const root = p.group.position.clone();
  const origin = a.feet.map((foot) => foot.target.clone());
  for (let i = 0; i < 240; i++) {
    a.update(1 / 60, sample());
    assert.ok(p.group.position.distanceTo(root) < 1e-9);
    for (let j = 0; j < 2; j++)
      if (a.feet[j].planted) assert.ok(a.feet[j].target.distanceTo(origin[j]) < 1e-9);
    finitePose(p.pose);
  }
  p.dispose();
});

test("talk and listen vary by seed, fade in 0.25s and cancel when moving", () => {
  const run = (seed, frames, intent, motionAt) => {
    const p = prepareCharacterRoot(gltf, undefined, 1.8);
    const a = new ProceduralAnimator(p.group, p.pose, { seed, style: 1 });
    let signature = "";
    for (let i = 0; i < frames; i++) {
      a.update(1 / 60, motionAt(i), intent);
      signature = poseSig(p.pose);
    }
    const status = a.status.loop;
    p.dispose();
    return { signature, status };
  };
  const talkA = run(4, 60, { loop: "talk" }, () => sample());
  const talkB = run(4, 60, { loop: "talk" }, () => sample());
  const talkC = run(11, 60, { loop: "talk" }, () => sample());
  assert.equal(talkA.signature, talkB.signature);
  assert.notEqual(talkA.signature, talkC.signature);
  assert.equal(talkA.status, "talk");
  const listenA = run(4, 60, { loop: "listen" }, () => sample());
  const listenB = run(11, 60, { loop: "listen" }, () => sample());
  assert.notEqual(listenA.signature, listenB.signature);

  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose, { seed: 5 });
  for (let i = 0; i < 30; i++) a.update(1 / 60, sample(), { loop: "talk" });
  assert.equal(a.status.loop, "talk");
  for (let i = 0; i < 16; i++) a.update(1 / 60, sample());
  assert.equal(a.status.loop, null);
  for (let i = 0; i < 30; i++) a.update(1 / 60, sample(), { loop: "listen" });
  assert.equal(a.status.loop, "listen");
  for (let i = 0; i < 20; i++) a.update(1 / 60, sample(1.5, (i * 1.5) / 60), { loop: "listen" });
  assert.equal(a.status.loop, null);
  p.dispose();
});

test("stagger recoil has no motion debt and ragdoll cancels the beat", async () => {
  for (const direction of [
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
  ]) {
    const p = prepareCharacterRoot(gltf, undefined, 1.8),
      a = new ProceduralAnimator(p.group, p.pose);
    a.update(1 / 60, sample());
    assert.ok(a.playBeat({ type: "stagger", direction, intensity: 1 }).accepted);
    const sum = { x: 0, z: 0 };
    for (let i = 0; i < 90; i++) {
      a.update(1 / 60, sample());
      if (a.motionRequest) {
        sum.x += a.motionRequest.translation.x;
        sum.z += a.motionRequest.translation.z;
      }
      finitePose(p.pose);
    }
    a.update(1 / 60, sample());
    assert.equal(a.motionRequest, null);
    const mag = Math.hypot(sum.x, sum.z),
      expected = a.rig.height * 0.28;
    assert.ok(mag > expected * 0.8 && mag < expected * 1.05, mag);
    assert.ok(sum.x * direction.x + sum.z * direction.z > 0);
    p.dispose();
  }
  const frames = (intensity) => {
    const p = prepareCharacterRoot(gltf, undefined, 1.8),
      a = new ProceduralAnimator(p.group, p.pose);
    a.update(1 / 60, sample());
    a.playBeat({ type: "stagger", direction: { x: 1, y: 0, z: 0 }, intensity });
    let n = 0;
    while (a.status.beat && n < 200) {
      a.update(1 / 60, sample());
      n++;
    }
    p.dispose();
    return n;
  };
  assert.ok(frames(1) > frames(0.2) + 5);

  const w = worldAt(),
    c = await createProceduralCharacter({
      gltf,
      height: 1.8,
      world: w,
      rapier: RAPIER,
      movement: false,
    });
  const events = [];
  c.onEvent((e) => events.push(e));
  tick(c, w, 5);
  assert.ok(
    c.playBeat({ type: "stagger", direction: { x: 1, y: 0, z: 0 }, intensity: 0.4 }).accepted,
  );
  c.knockdown({ impulse: { x: 40, y: 10, z: 0 } });
  assert.ok(events.some((e) => e.type === "beatCancelled" && e.reason === "ragdoll"));
  assert.equal(c.status.physics, "ragdoll");
  assert.equal(c.playBeat({ type: "wave" }).reason, "physics");
  c.dispose();
  w.free();
});

test("point arm selection, walking nod and clipped or blocked sidestep", () => {
  const reach = (target, arm) => {
    const p = prepareCharacterRoot(gltf, undefined, 1.8),
      a = new ProceduralAnimator(p.group, p.pose);
    a.update(1 / 60, sample());
    assert.ok(a.playBeat({ type: "point", target, arm }).accepted);
    for (let i = 0; i < 40; i++) a.update(1 / 60, sample());
    const left = p.pose.require("LeftHand").getWorldPosition(new Vector3());
    const right = p.pose.require("RightHand").getWorldPosition(new Vector3());
    const goal = new Vector3(target.x, target.y, target.z);
    finitePose(p.pose);
    p.dispose();
    return { left: left.distanceTo(goal), right: right.distanceTo(goal) };
  };
  const autoLeft = reach({ x: 2, y: 1.2, z: 3 });
  const autoRight = reach({ x: -2, y: 1.2, z: 3 });
  const forcedRight = reach({ x: 2, y: 1.2, z: 3 }, "right");
  assert.ok(autoLeft.left < autoLeft.right);
  assert.ok(autoRight.right < autoRight.left);
  assert.ok(forcedRight.right < forcedRight.left);

  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose);
  a.update(1 / 60, sample(1.4));
  assert.ok(a.playBeat({ type: "nod" }).accepted);
  for (let i = 0; i < 50; i++) a.update(1 / 60, sample(1.4, (i * 1.4) / 60));
  assert.equal(a.status.locomotion, "walk");
  finitePose(p.pose);
  a.update(1 / 60, sample());
  assert.ok(a.playBeat({ type: "punch" }).accepted);
  assert.equal(
    a.playBeat({ type: "sidestep", direction: { x: 1, y: 0, z: 0 }, distance: 0.4 }).reason,
    "busy",
  );
  for (let i = 0; i < 50; i++) a.update(1 / 60, sample());
  assert.ok(
    a.playBeat({ type: "sidestep", direction: { x: 1, y: 0, z: 0 }, distance: a.rig.height * 0.45 })
      .accepted,
  );
  let motion = sample(),
    travelled = 0;
  for (let i = 0; i < 60; i++) {
    a.update(1 / 60, motion);
    const request = a.motionRequest;
    if (request) {
      motion = {
        ...motion,
        position: {
          x: motion.position.x + request.translation.x * 0.5,
          y: motion.position.y,
          z: motion.position.z + request.translation.z * 0.5,
        },
      };
      travelled += Math.hypot(request.translation.x, request.translation.z) * 0.5;
    }
    finitePose(p.pose);
  }
  assert.ok(travelled < a.rig.height * 0.45 * 0.6, travelled);
  a.playBeat({ type: "point", target: { x: 0, y: 0, z: 0 } });
  for (let i = 0; i < 20; i++) a.update(1 / 60, sample());
  a.playBeat({ type: "point", target: { x: 1e6, y: 1e6, z: 1e6 } });
  for (let i = 0; i < 20; i++) a.update(1 / 60, sample());
  finitePose(p.pose);
  p.dispose();
});
test("gait phase follows actual distance, not elapsed idle time", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8),
    a = new ProceduralAnimator(p.group, p.pose);
  for (let i = 0; i < 60; i++) a.update(1 / 60, sample());
  assert.equal(a.phase, 0);
  for (let i = 0; i < 60; i++) a.update(1 / 60, sample(0.5, i / 120));
  assert.ok(a.phase > 0);
  const phase = a.phase;
  a.update(1 / 60, sample());
  assert.equal(a.phase, phase);
  p.dispose();
});
test("ragdoll has 13 segments, preserves motion, stable anchors and releases all resources", async () => {
  const w = worldAt(),
    baseline = w.bodies.len();
  const c = await createProceduralCharacter({
    gltf,
    height: 1.8,
    world: w,
    rapier: RAPIER,
    movement: false,
  });
  for (let i = 0; i < 20; i++) {
    c.setMotion(sample(2, i / 30));
    tick(c, w);
  }
  c.knockdown({ impulse: { x: 100, y: 15, z: 0 } });
  assert.equal(c.ragdoll.diagnostics().bodies, 13);
  let max = 0;
  for (let i = 0; i < 600; i++) {
    tick(c, w);
    const d = c.ragdoll.diagnostics();
    assert.ok(d.finite);
    max = Math.max(max, d.maxAnchorError);
  }
  console.log(
    "ragdoll max anchor error:",
    max,
    "settled:",
    c.ragdollSettled,
    "hips:",
    c.hipsWorld().toArray(),
  );
  assert.ok(max < 0.15, `anchor error ${max}`);
  assert.ok(c.hipsWorld().y > -0.15);
  c.applyImpulse({ impulse: { x: 0, y: 70, z: 0 } });
  assert.equal(c.ragdollSettled, false);
  c.dispose();
  c.dispose();
  assert.equal(w.bodies.len(), baseline);
  assert.equal(w.impulseJoints.len(), 0);
  w.free();
});
test("recovery rejects moving bodies", async () => {
  const w = worldAt(),
    c = await createProceduralCharacter({ gltf, height: 1.8, world: w, rapier: RAPIER });
  const events = [];
  c.onEvent((e) => events.push(e));
  c.knockdown();
  assert.equal(c.requestRecovery(), false);
  assert.equal(events.at(-1).reason, "moving");
  c.dispose();
  w.free();
});

test("settled recovery completes on elevated ground and can be interrupted", async () => {
  const w = worldAt(1),
    c = await createProceduralCharacter({
      gltf,
      height: 1.8,
      world: w,
      rapier: RAPIER,
      movement: false,
      position: { x: 0, y: 1.02, z: 0 },
    });
  c.knockdown({ impulse: { x: 100, y: 15, z: 0 } });
  for (let i = 0; i < 1200 && !c.ragdollSettled; i++) tick(c, w);
  assert.ok(c.ragdollSettled, "ragdoll should settle");
  assert.ok(c.requestRecovery());
  assert.equal(c.status.physics, "gettingUp");
  assert.equal(c.playBeat({ type: "nod" }).reason, "physics");
  tick(c, w, 180);
  assert.equal(c.status.physics, "animated");
  assert.equal(c.status.locomotion, "idle");
  assert.ok(Math.abs(c.motionSample.position.y - 1) < 0.05);
  c.knockdown();
  assert.equal(c.status.physics, "ragdoll");
  c.dispose();
  w.free();
});

test("fast gait: planted feet stay fixed and rapid reversals remain finite", () => {
  const p = prepareCharacterRoot(gltf, undefined, 1.8);
  const a = new ProceduralAnimator(p.group, p.pose);
  const position = new Vector3();
  let lockedFrames = 0;
  let movingLocks = 0;
  for (let i = 0; i < 360; i++) {
    const dt = [1 / 120, 1 / 60, 1 / 30][i % 3];
    const speed = i < 120 ? 4.5 : i < 240 ? -9 : 0;
    position.z += speed * dt;
    const previous = a.feet.map((f) => ({ planted: f.planted, target: f.target.clone() }));
    a.update(dt, {
      position,
      facingYaw: speed < 0 ? Math.PI : 0,
      velocity: { x: 0, y: 0, z: speed },
      grounded: true,
    });
    for (let j = 0; j < 2; j++) {
      const f = a.feet[j];
      if (previous[j].planted && f.planted) {
        assert.ok(f.target.distanceTo(previous[j].target) < 1e-9);
        lockedFrames++;
        if (speed !== 0) movingLocks++;
      }
      const side = j === 0 ? "Left" : "Right";
      const ankle = p.pose.require(side + "Foot").getWorldPosition(new Vector3());
      assert.ok(ankle.toArray().every(Number.isFinite));
      if (f.planted)
        assert.ok(
          ankle.distanceTo(f.target) < 0.005,
          JSON.stringify({
            i,
            dt,
            speed,
            side,
            distance: ankle.distanceTo(f.target),
            ankle,
            target: f.target,
            locomotion: a.status.locomotion,
          }),
        );
      for (const bone of [side + "UpLeg", side + "Leg"]) {
        const q = p.pose.require(bone).quaternion;
        assert.ok(q.toArray().every(Number.isFinite));
        assert.ok(Math.abs(q.length() - 1) < 1e-6);
      }
    }
  }
  assert.ok(lockedFrames > 20);
  assert.ok(movingLocks > 0);
  p.dispose();
});

test("running turns: stable sole contacts and render interpolation at 30/60/120 Hz", async () => {
  const endpoints = [];
  for (const fps of [30, 60, 120]) {
    const w = worldAt(),
      c = await createProceduralCharacter({ gltf, height: 1.8, world: w, rapier: RAPIER });
    const clock = new FixedClock();
    let ticks = 0,
      contacts = 0,
      landings = 0;
    const previous = [null, null];
    for (let frame = 0; frame < fps * 6; frame++) {
      const alpha = clock.advance(1 / fps, (dt) => {
        const turn = ticks >= 90 ? (Math.floor((ticks - 90) / 30) % 2 ? -1 : 1) : 0;
        c.setInput({
          moveX: turn,
          moveZ: 1,
          run: ticks >= 30,
          speed: ticks >= 30 ? 4.5 : 1.5,
          jump: false,
          crouch: false,
          ragdollToggle: false,
        });
        c.beforePhysics(dt);
        w.step();
        c.afterPhysics(dt);
        if (ticks > 30) assert.ok(c.grounded, JSON.stringify({ ticks, motion: c.motionSample }));
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? "Left" : "Right",
            f = c.animator.feet[i];
          const ankle = c.animator.pose.require(side + "Foot").getWorldPosition(new Vector3());
          const toe = c.animator.pose.require(side + "Toes").getWorldPosition(new Vector3());
          const old = previous[i];
          if (old) {
            if (ticks > 30)
              assert.ok(
                ankle.distanceTo(old.ankle) < 0.23,
                JSON.stringify({
                  ticks,
                  side,
                  distance: ankle.distanceTo(old.ankle),
                  old: old.ankle,
                  ankle,
                  target: f.target,
                  age: f.age,
                  duration: f.duration,
                  planted: f.planted,
                }),
              );
            if (ticks > 90 && old.planted && f.planted) {
              assert.ok(ankle.distanceTo(old.ankle) < 0.002, "planted ankle drift");
              assert.ok(toe.distanceTo(old.toe) < 0.002, "planted sole rotates with body");
              contacts++;
            }
            if (ticks > 90 && !old.planted && f.planted) landings++;
          }
          previous[i] = { ankle, toe, planted: f.planted };
        }
        ticks++;
      });
      const anchors = c.animator.feet.map((f) => f.target.clone());
      c.updateVisual(alpha);
      if (c.previous.groundIK && c.current.groundIK)
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? "Left" : "Right";
          const desired = c.previous.feet[i].position
            .clone()
            .lerp(c.current.feet[i].position, alpha);
          const actual = c.animator.pose.require(side + "Foot").getWorldPosition(new Vector3());
          assert.ok(actual.distanceTo(desired) < 0.002, "render interpolation loses ankle target");
          assert.ok(
            c.animator.feet[i].target.equals(anchors[i]),
            "render mutates simulation anchor",
          );
        }
    }
    assert.ok(contacts > 30, "running needs sustained contacts, not isolated contact frames");
    assert.ok(landings > 10, "running feet must replant repeatedly");
    endpoints.push(c.motionSample.position);
    c.dispose();
    w.free();
  }
  assert.deepEqual(endpoints[0], endpoints[1]);
  assert.deepEqual(endpoints[1], endpoints[2]);
});

test("contact tolerance preserves real jumps and releases support at ledges", async () => {
  for (const jump of [true, false]) {
    const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    w.timestep = 1 / 60;
    w.createCollider(
      RAPIER.ColliderDesc.cuboid(5, 0.2, 1)
        .setTranslation(0, -0.2, -0.5)
        .setCollisionGroups(GROUND_GROUPS),
    );
    w.step();
    const c = await createProceduralCharacter({ gltf, height: 1.8, world: w, rapier: RAPIER });
    tick(c, w, 30);
    assert.ok(c.grounded);
    c.setInput({
      moveX: 0,
      moveZ: jump ? 0 : 1,
      speed: 4.5,
      run: true,
      jump,
      crouch: false,
      ragdollToggle: false,
    });
    let airborne = false;
    for (let i = 0; i < 90; i++) {
      tick(c, w);
      if (!c.grounded) {
        airborne = true;
        break;
      }
    }
    assert.ok(airborne, jump ? "jump must release anchors" : "ledge must release anchors");
    assert.ok(c.animator.feet.every((f) => !f.ready && !f.planted));
    c.dispose();
    w.free();
  }
});

test("limb handoff alternates through repeated walk/run/stop/turn transitions", () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
    const p = prepareCharacterRoot(gltf, undefined, 1.8);
    const a = new ProceduralAnimator(p.group, p.pose);
    const position = new Vector3(),
      velocity = new Vector3();
    let yaw = 0,
      lastLift = -1,
      lifts = 0,
      touchdowns = 0;
    a.update(dt, sample());
    for (let i = 0; i < Math.round(9 / dt); i++) {
      const stage = Math.floor((i * dt) / 0.6) % 5;
      const speed = [1.5, 4.5, 4.5, 0, 1.5][stage];
      const heading = stage === 2 ? Math.PI / 3 : stage === 4 ? -Math.PI / 3 : 0;
      const desired = new Vector3(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
      velocity.add(desired.sub(velocity).clampLength(0, 7.2 * dt));
      position.addScaledVector(velocity, dt);
      yaw += Math.max(-4.5 * dt, Math.min(4.5 * dt, heading - yaw));
      const before = a.feet.map((f) => ({ planted: f.planted, duration: f.duration }));
      a.update(dt, { position, facingYaw: yaw, velocity, grounded: true });
      let starts = 0,
        ends = 0;
      for (let j = 0; j < 2; j++) {
        const f = a.feet[j];
        if (before[j].planted && !f.planted) {
          starts++;
          lifts++;
          assert.notEqual(j, lastLift, "the same limb must not steal the next step");
          lastLift = j;
        }
        if (!before[j].planted && f.planted) {
          ends++;
          touchdowns++;
        }
        if (!before[j].planted && !f.planted)
          assert.equal(f.duration, before[j].duration, "transition resets an active swing");
        assert.ok(f.target.toArray().every(Number.isFinite));
      }
      if (a.feet.every((f) => !f.planted && f.age < f.duration)) {
        const separation = Math.abs(
          a.feet[0].age / a.feet[0].duration - a.feet[1].age / a.feet[1].duration,
        );
        assert.ok(separation > 0.05, "airborne limbs converged to the same phase");
      }
      assert.ok(starts <= 1, "both feet lifted in the same tick");
      assert.ok(ends <= 1, "both feet landed in the same tick");
    }
    assert.ok(lifts > 20 && touchdowns > 20, "handoff must not deadlock");
    p.dispose();
  }
});

test("stride displacement grows with speed while touchdown remains reachable", () => {
  const measurements = [];
  for (const speed of [1.5, 3, 4.5]) {
    const p = prepareCharacterRoot(gltf, undefined, 1.8);
    const a = new ProceduralAnimator(p.group, p.pose);
    const previousLanding = [null, null];
    let leads = 0,
      strides = 0,
      contacts = 0,
      steps = 0;
    a.update(1 / 60, sample());
    for (let i = 1; i <= 480; i++) {
      const before = a.feet.map((f) => f.planted);
      const z = (i * speed) / 60;
      a.update(1 / 60, sample(speed, z));
      for (let j = 0; j < 2; j++)
        if (!before[j] && a.feet[j].planted && i > 120) {
          const f = a.feet[j];
          const ankle = p.pose
            .require(j === 0 ? "LeftFoot" : "RightFoot")
            .getWorldPosition(new Vector3());
          assert.ok(ankle.distanceTo(f.target) < 0.005);
          leads += f.target.z - z;
          contacts++;
          if (previousLanding[j] !== null) {
            strides += f.target.z - previousLanding[j];
            steps++;
          }
          previousLanding[j] = f.target.z;
        }
    }
    assert.ok(contacts > 10 && steps > 10);
    measurements.push({ lead: leads / contacts, stride: strides / steps });
    p.dispose();
  }
  assert.ok(measurements[1].lead > measurements[0].lead);
  assert.ok(measurements[2].lead > measurements[1].lead);
  assert.ok(measurements[2].lead > measurements[0].lead * 1.5);
  assert.ok(measurements[2].stride > measurements[0].stride * 1.3);
});

test("AnimatedCharacter interpolates fixed poses and ignores updates after dispose", () => {
  const actor = createAnimatedCharacter({ gltf, height: 1.8, seed: 3 });
  actor.fixedUpdate(1 / 60, sample(0, 0));
  actor.fixedUpdate(1 / 60, sample(1.2, 0.4));
  actor.updateVisual(0);
  const start = actor.object.position.z;
  actor.updateVisual(1);
  const end = actor.object.position.z;
  actor.updateVisual(0.5);
  assert.ok(Number.isFinite(actor.object.position.z));
  actor.setParameters({ style: 0.4, cadence: 2.8 });
  const hip = new Vector3();
  actor.hipWorldPosition(hip);
  assert.ok(hip.toArray().every(Number.isFinite));
  assert.ok(end !== start || start === actor.object.position.z);
  actor.dispose();
  actor.fixedUpdate(1 / 60, sample(2, 1));
  actor.updateVisual(1);
  actor.setParameters({ style: 1 });
  assert.equal(actor.playBeat({ type: "wave" }).accepted, false);
  assert.equal(actor.motionRequest, null);
});
