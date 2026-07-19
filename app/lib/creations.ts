// "Your games" is tracked client-side (no accounts): the ids of generations you
// started, remembered in localStorage. The server runs each build as an
// independent detached process, so leaving the page never kills a build — this
// list just lets you find your games and their status again.
export type Creation = { id: string; prompt: string; ts: number };

const KEY = 'gs_creations';
const MAX = 40;

export function listCreations(): Creation[] {
  if (typeof window === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addCreation(c: Creation): void {
  if (typeof window === 'undefined') return;
  const next = [c, ...listCreations().filter((x) => x.id !== c.id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('gs:creations-changed'));
}
