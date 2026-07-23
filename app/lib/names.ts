// Leaderboard name hygiene: clamp, normalize, and word-filter.
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'hitler', 'nazi', 'kys',
  'bitch', 'whore', 'slut', 'cock', 'dick', 'penis', 'porn', 'sex',
];

// Signup gamertags, in the sketchbook's voice: DoodleFox42, InkyComet87.
// ~36k combos; uniqueness is enforced by the caller with a retry loop.
const TAG_ADJ = ['Doodle', 'Scribble', 'Pixel', 'Biro', 'Crayon', 'Sketchy', 'Inky', 'Paper', 'Wobbly', 'Turbo', 'Lucky', 'Sneaky', 'Dizzy', 'Zippy', 'Bouncy', 'Rowdy', 'Plucky', 'Snappy', 'Crispy', 'Mighty'];
const TAG_NOUN = ['Fox', 'Comet', 'Penguin', 'Goblin', 'Rocket', 'Walrus', 'Bandit', 'Wizard', 'Yeti', 'Falcon', 'Newt', 'Badger', 'Mole', 'Otter', 'Pilot', 'Knight', 'Pirate', 'Moth', 'Toad', 'Lynx'];

export function randomGamertag(): string {
  const a = TAG_ADJ[Math.floor(Math.random() * TAG_ADJ.length)];
  const n = TAG_NOUN[Math.floor(Math.random() * TAG_NOUN.length)];
  return `${a}${n}${Math.floor(10 + Math.random() * 90)}`;
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[^\p{L}\p{N} _\-.]/gu, '').trim().slice(0, 16);
  if (name.length < 1) return null;
  const flat = name.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCKED.some((w) => flat.includes(w))) return null;
  return name;
}
