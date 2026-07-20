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

// The cooking tray lets you dismiss a finished build so it stops showing. We
// remember dismissed ids so they don't reappear on reload.
const DISMISS_KEY = 'gs_creations_dismissed';

export function listDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const arr = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function dismissCreation(id: string): void {
  if (typeof window === 'undefined') return;
  const next = [id, ...listDismissed().filter((x) => x !== id)].slice(0, MAX);
  localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('gs:creations-changed'));
}
