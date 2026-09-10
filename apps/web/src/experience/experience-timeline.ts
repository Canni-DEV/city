import type { CityDocumentV1, NpcPose } from "@city/core";

export const EXPERIENCE_LOAD_GATE = 0.28;
export const EXPERIENCE_FINAL_ACT = 0.9;

export interface ExperienceHero {
  id: string;
  pose: NpcPose;
}

export interface ExperienceCameraFrame {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function scrollProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const range = scrollHeight - viewportHeight;
  return range > 0 ? clampProgress(scrollY / range) : 0;
}

export function gatedExperienceProgress(raw: number, sceneReady: boolean): number {
  const progress = clampProgress(raw);
  return sceneReady ? progress : Math.min(progress, EXPERIENCE_LOAD_GATE);
}

function smooth(value: number): number {
  const t = clampProgress(value);
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pointSegmentDistance(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const length2 = dx * dx + dz * dz;
  if (length2 <= 1e-9) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / length2),
  );
  return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dz * t));
}

/** Web-only deterministic composition choice; it never mutates NPC or document state. */
export function selectExperienceHero(
  document: CityDocumentV1,
  poses: ReadonlyMap<string, NpcPose>,
): ExperienceHero | null {
  const roadCells = new Set(
    document.roadGraph.cells.map((cell) => `${cell.position[0]},${cell.position[1]}`),
  );
  const intersections = document.roadGraph.cells
    .filter((cell) => {
      const [x, z] = cell.position;
      const neighbors = [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`].filter(
        (key) => roadCells.has(key),
      ).length;
      return neighbors >= 3;
    })
    .map((cell) => [cell.position[0] + 0.5, cell.position[1] + 0.5] as const);
  const center = document.map.size / 2;
  return (
    [...poses]
      .map(([id, pose]) => {
        const front: [number, number] = [
          pose.x + Math.sin(pose.yaw) * 8,
          pose.z + Math.cos(pose.yaw) * 8,
        ];
        const outside = front.some((value) => value < 1 || value >= document.map.size - 1);
        const occlusion = Object.values(document.entities).reduce((penalty, entity) => {
          const distance = pointSegmentDistance(
            [entity.transform.position[0], entity.transform.position[2]],
            [pose.x, pose.z],
            front,
          );
          const radius = Math.hypot(entity.footprint.width, entity.footprint.depth) * 0.5;
          return penalty + (distance < radius + 0.6 ? 24 : 0);
        }, 0);
        const junctionDistance = intersections.length
          ? Math.min(
              ...intersections.map((point) => Math.hypot(point[0] - pose.x, point[1] - pose.z)),
            )
          : document.map.size;
        const centrality = Math.hypot(pose.x - center, pose.z - center);
        return {
          id,
          pose,
          score: (outside ? 1000 : 0) + occlusion + junctionDistance * 2 + centrality * 0.15,
        };
      })
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function experienceCameraFrame(
  progress: number,
  mapSize: number,
  hero: ExperienceHero | null,
): ExperienceCameraFrame {
  const p = clampProgress(progress);
  const heroScene: [number, number, number] = hero
    ? [hero.pose.x - mapSize / 2, hero.pose.y + 0.8, hero.pose.z - mapSize / 2]
    : [0, 0.8, 0];
  // REN-012 / TST-014: a continuous dolly without intermediate easing stops.
  const yaw = hero?.pose.yaw ?? 0;
  const distance = Math.exp(mix(Math.log(mapSize * 1.54), Math.log(7.5), p));
  const elevation = mix(Math.atan2(1.28, 0.86), Math.atan2(4.5, 6), p);
  const horizontal = distance * Math.cos(elevation);
  return {
    position: [
      heroScene[0] + Math.sin(yaw) * horizontal,
      heroScene[1] + distance * Math.sin(elevation),
      heroScene[2] + Math.cos(yaw) * horizontal,
    ],
    target: heroScene,
    fov: 43,
  };
}

export function actOpacity(progress: number, start: number, peak: number, end: number): number {
  const p = clampProgress(progress);
  if (p <= start || p >= end) return 0;
  if (p < peak) return smooth((p - start) / Math.max(peak - start, 1e-6));
  return 1 - smooth((p - peak) / Math.max(end - peak, 1e-6));
}

/** UX-028: the aperture is the scaled dot at every viewport size. */
export function experienceReveal(progress: number, dotRadius: number, viewportRadius: number) {
  const t = clampProgress(progress / 0.62);
  const radius = Math.max(1, dotRadius);
  const scale = Math.exp(Math.log(Math.max(1, viewportRadius / radius)) * t);
  return {
    scale,
    maskRadius: radius * scale,
    opacity: 1 - smooth((t - 0.82) / 0.18),
  };
}
