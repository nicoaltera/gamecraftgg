// Leaderboard name hygiene: clamp, normalize, and word-filter.
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'hitler', 'nazi', 'kys',
  'bitch', 'whore', 'slut', 'cock', 'dick', 'penis', 'porn', 'sex',
];

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  if (name.length < 1) return null;
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return name;
}
