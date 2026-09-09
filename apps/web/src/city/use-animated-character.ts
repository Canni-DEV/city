import {
  type AnimatedCharacter,
  type CreateAnimatedCharacterOptions,
  createAnimatedCharacter,
} from "@city/procedural-animation";
import { type DependencyList, type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * Create the actor in layout so React Strict Mode dispose/recreate cannot leave
 * a dead instance in a memoized value that useFrame would keep updating.
 */
export function useAnimatedCharacter(
  createOptions: () => CreateAnimatedCharacterOptions,
  deps: DependencyList,
  attach?: (actor: AnimatedCharacter) => () => void,
): {
  actor: AnimatedCharacter | null;
  actorRef: RefObject<AnimatedCharacter | null>;
} {
  const actorRef = useRef<AnimatedCharacter | null>(null);
  const [actor, setActor] = useState<AnimatedCharacter | null>(null);
  useLayoutEffect(() => {
    const created = createAnimatedCharacter(createOptions());
    actorRef.current = created;
    setActor(created);
    const detach = attach?.(created);
    return () => {
      detach?.();
      if (actorRef.current === created) actorRef.current = null;
      created.dispose();
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: caller supplies identity deps
  }, deps);
  return { actor, actorRef };
}
