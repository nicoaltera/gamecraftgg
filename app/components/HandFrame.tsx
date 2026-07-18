// The signature element (04-site-design-language.md): a slightly wobbly
// single-stroke ink frame, like a rectangle drawn confidently by hand.
// Seeded so each frame's wobble is unique but stable across renders.

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

export function wobblePath(seed: string, w = 100, h = 62.5, amp = 0.9): string {
  const rand = mulberry32(hashSeed(seed));
  const jitter = () => (rand() - 0.5) * 2 * amp;
  const pts: [number, number][] = [];
  const step = 8;
  for (let x = 0; x <= w; x += step) pts.push([x + (x > 0 && x < w ? jitter() * 0.4 : 0), jitter()]);
  for (let y = step; y <= h; y += step) pts.push([w + jitter(), y + (y < h ? jitter() * 0.4 : 0)]);
  for (let x = w - step; x >= 0; x -= step) pts.push([x + (x > 0 ? jitter() * 0.4 : 0), h + jitter()]);
  for (let y = h - step; y >= step; y -= step) pts.push([jitter(), y + jitter() * 0.4]);
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`)
    .join(' ');
  return `${d} Z`;
}

export default function HandFrame({ seed, strokeWidth = 1.6 }: { seed: string; strokeWidth?: number }) {
  return (
    <svg className="hand-frame" viewBox="0 0 100 62.5" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={wobblePath(seed)}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
