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

function mix3(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [mix(a[0] ?? 0, b[0] ?? 0, t), mix(a[1] ?? 0, b[1] ?? 0, t), mix(a[2] ?? 0, b[2] ?? 0, t)];
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
  const yaw = hero?.pose.yaw ?? 0;
  const finalPosition: [number, number, number] = [
    heroScene[0] + Math.sin(yaw) * 6,
    heroScene[1] + 4.5,
    heroScene[2] + Math.cos(yaw) * 6,
  ];
  const overview: ExperienceCameraFrame = {
    position: [0, mapSize * 1.28, mapSize * 0.86],
    target: [0, 0, 0],
    fov: 34,
  };
  const districtPosition: [number, number, number] = [
    heroScene[0] * 0.55 + 12,
    mapSize * 0.42,
    heroScene[2] * 0.55 + 22,
  ];
  if (p <= 0.62) {
    const t = smooth((p - 0.28) / 0.34);
    return {
      position: mix3(overview.position, districtPosition, t),
      target: mix3(overview.target, [heroScene[0] * 0.45, 0, heroScene[2] * 0.45], t),
      fov: mix(overview.fov, 42, t),
    };
  }
  const t = smooth((p - 0.62) / 0.38);
  return {
    position: mix3(districtPosition, finalPosition, t),
    target: mix3([heroScene[0] * 0.45, 0, heroScene[2] * 0.45], heroScene, t),
    fov: mix(42, 43, t),
  };
}

export function actOpacity(progress: number, start: number, peak: number, end: number): number {
  const p = clampProgress(progress);
  if (p <= start || p >= end) return 0;
  if (p < peak) return smooth((p - start) / Math.max(peak - start, 1e-6));
  return 1 - smooth((p - peak) / Math.max(end - peak, 1e-6));
}
