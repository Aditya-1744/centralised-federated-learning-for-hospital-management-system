"use client";

// Referenced by dashboard.tsx (and dotted-map was already in package.json for
// it) but the file itself was never created -- written here so the import
// resolves. Standard dotted-map hero: a dot-matrix world with animated arcs
// from each hospital node to the FL aggregation hub.
import { useMemo } from "react";
import DottedMap from "dotted-map";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";

type Point = { lat: number; lng: number; label?: string };

function project(p: Point) {
  return { x: (p.lng + 180) * (800 / 360), y: (90 - p.lat) * (400 / 180) };
}

export function WorldMap({
  dots = [],
  lineColor = "var(--chart-series-1)",
}: {
  dots?: { start: Point; end: Point }[];
  lineColor?: string;
}) {
  const { resolvedTheme } = useTheme();
  const svgMap = useMemo(() => {
    const map = new DottedMap({ height: 100, grid: "diagonal" });
    return map.getSVG({
      radius: 0.22,
      color: resolvedTheme === "dark" ? "#FFFFFF40" : "#00000040",
      shape: "circle",
      backgroundColor: "transparent",
    });
  }, [resolvedTheme]);

  return (
    <div className="relative aspect-[2/1] w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="pointer-events-none h-full w-full select-none [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)]"
        alt="World map of hospital nodes"
        draggable={false}
      />
      <svg viewBox="0 0 800 400" className="pointer-events-none absolute inset-0 h-full w-full">
        {dots.map((dot, i) => {
          const s = project(dot.start);
          const e = project(dot.end);
          const mid = { x: (s.x + e.x) / 2, y: Math.min(s.y, e.y) - 40 };
          return (
            <g key={i}>
              <motion.path
                d={`M ${s.x} ${s.y} Q ${mid.x} ${mid.y} ${e.x} ${e.y}`}
                fill="none"
                stroke={lineColor}
                strokeWidth={1}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1, delay: 0.05 * i, ease: "easeOut" }}
              />
              <circle cx={s.x} cy={s.y} r={2.5} fill={lineColor}>
                {dot.start.label && <title>{dot.start.label}</title>}
              </circle>
              <circle cx={e.x} cy={e.y} r={3} fill={lineColor} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
