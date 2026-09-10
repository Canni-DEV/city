import { type CSSProperties, useEffect, useRef } from "react";

const DOT_RADIUS_IN_VIEWBOX = 10;
const VIEWBOX_WIDTH = 520;

export function CityWordmark({
  scale,
  opacity,
  onDotRadius,
}: {
  scale: number;
  opacity: number;
  onDotRadius: (radius: number) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);

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
