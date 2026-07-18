'use client';

import { useEffect, useRef, useState } from 'react';

// The signature element (04-site-design-language.md): a slightly wobbly
// single-stroke ink frame, "drawn confidently by hand — NOT shaky."
// The wobble amplitude is a FIXED number of pixels regardless of the frame's
// size, so it reads the same on a 240px card and an 800px game stage. Drawn in
// measured pixel space (not a stretched viewBox) so it never distorts or clips.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const AMP = 1.5; // px of hand-wobble, constant at every size
const INSET = 4; // keep the stroke (and its wobble) safely inside the box
const SPACING = 22; // px between wobble points along each edge

function framePath(seed: string, w: number, h: number): string {
  const rand = mulberry32(hashSeed(seed));
  const j = () => (rand() - 0.5) * 2 * AMP;
  const x0 = INSET, y0 = INSET, x1 = w - INSET, y1 = h - INSET;
  if (x1 <= x0 || y1 <= y0) return '';
  const pts: [number, number][] = [];
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / SPACING));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([ax + (bx - ax) * t + j(), ay + (by - ay) * t + j()]);
    }
  };
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x1, y1, x0, y1);
  edge(x0, y1, x0, y0);
  // Catmull-Rom → smooth closed stroke so corners read as confident, not kinked
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

export default function HandFrame({ seed, strokeWidth = 1.6 }: { seed: string; strokeWidth?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="hand-frame" aria-hidden="true">
      {size && (
        <svg width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`}>
          <path
            d={framePath(seed, size.w, size.h)}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
