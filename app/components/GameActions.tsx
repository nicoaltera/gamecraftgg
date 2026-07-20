'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRef } from '@/lib/ref';
import { addCreation } from '@/lib/creations';

// Owner controls (draft badge, Publish, continue-editing) + Remix for everyone.
export default function GameActions({
  slug,
  title,
  status,
  creatorRef,
  parentSlug,
}: {
  slug: string;
  title: string;
  status: string;
  creatorRef: string;
  parentSlug: string;
}) {
  const [mine, setMine] = useState(false);
  const [state, setState] = useState(status);
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setMine(!!creatorRef && getRef() === creatorRef);
  }, [creatorRef]);

  async function publish() {
    setBusy(true);
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ref: getRef() }),
    });
    setBusy(false);
    if (res.ok) {
      setState('published');
      setNote('Published to the library!');
    } else setNote('Could not publish.');
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim(), ref: getRef(), editSlug: slug }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok && d.id) {
      addCreation({ id: d.id, prompt: `edit: ${prompt.trim()}`, ts: Date.now() });
      router.push(`/build/${d.id}`);
    } else setNote(d.error ?? 'Could not start that edit.');
  }

  return (
    <div className="game-actions-bar">
      {parentSlug && (
        <p className="lineage">
          remixed from <a href={`/g/${parentSlug}`}>{parentSlug}</a>
        </p>
      )}

      {mine && state === 'draft' && (
        <div className="draft-box">
          <span className="draft-badge">DRAFT — only you can see this</span>
          <button className="btn btn-biro" onClick={publish} disabled={busy}>
            Publish to library
          </button>
        </div>
      )}
      {mine && state === 'published' && <span className="live-badge">● live in the library</span>}

      {mine && (
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
