import { type CSSProperties, useEffect, useRef } from "react";
import { clampProgress } from "./experience-timeline";

const DOT_RADIUS_IN_VIEWBOX = 10;
const VIEWBOX_WIDTH = 520;

export function CityWordmark({
  progress,
  onDotRadius,
}: {
  progress: number;
  onDotRadius: (radius: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const zoom = clampProgress((progress - 0.18) / 0.34);
  const scale = 1 + zoom * 8;
  const opacity = 1 - clampProgress((progress - 0.3) / 0.22);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () =>
      onDotRadius((element.clientWidth * DOT_RADIUS_IN_VIEWBOX) / VIEWBOX_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onDotRadius]);

  return (
    <svg
      ref={svg}
      className="experience-wordmark"
      viewBox="0 0 520 180"
      aria-hidden="true"
      style={
        {
          "--experience-wordmark-scale": scale,
          "--experience-wordmark-opacity": opacity,
        } as CSSProperties
      }
    >
      <text x="8" y="154" textLength="500" lengthAdjust="spacingAndGlyphs">
        Cıty
      </text>
      <circle className="experience-wordmark-dot" cx="222" cy="48" r="10" />
    </svg>
  );
}
