import type RAPIER from "@dimforge/rapier3d-compat";
import type { Texture } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { AnimationOptions, RagdollOptions, Vec3 } from "./types";
export interface CreateCharacterOptions extends AnimationOptions {
  gltf: GLTF | string;
  texture?: Texture;
  world: RAPIER.World;
  rapier: typeof RAPIER;
  ragdoll?: RagdollOptions;
  movement?: boolean;
  position?: Vec3;
}
