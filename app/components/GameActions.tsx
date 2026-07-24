'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addCreation } from '@/lib/creations';

// Owner controls. Games publish automatically when the judges pass them —
// the only owner action left is iterating: "keep editing (prompt it)".
// Ownership is decided SERVER-SIDE on the game page and passed in.
export default function GameActions({
  slug,
  isOwner,
  parentSlug,
}: {
  slug: string;
  isOwner: boolean;
  parentSlug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim(), editSlug: slug }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok && d.id) {
      addCreation({ id: d.id, prompt: `edit: ${prompt.trim()}`, ts: Date.now() });
      router.push(`/build/${d.id}`);
    } else setNote(d.error ?? 'Could not start that edit.');
  }

  if (!isOwner && !parentSlug) return null;

  return (
    <div className="game-actions-bar">
      {parentSlug && (
        <p className="lineage">
          remixed from <a href={`/g/${parentSlug}`}>{parentSlug}</a>
        </p>
      )}

      {isOwner && (
        <div className="edit-area">
          {editing ? (
            <form className="edit-row" onSubmit={submitEdit}>
              <input
                className="edit-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="change it — e.g. make it faster, add a boss…"
                maxLength={400}
                autoFocus
              />
              <button className="btn" type="submit" disabled={busy || !prompt.trim()}>
                {busy ? 'reworking…' : 'Apply'}
              </button>
            </form>
          ) : (
            <button className="btn" onClick={() => setEditing(true)}>
              Keep editing (prompt it)
            </button>
          )}
        </div>
      )}

      {note && <span className="actions-note">{note}</span>}
    </div>
  );
}
