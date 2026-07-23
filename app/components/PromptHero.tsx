'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HandFrame from './HandFrame';
import { addCreation } from '@/lib/creations';

export default function PromptHero() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // 'auth' | 'credits' from the API — turns the note into an actionable link
  const [errCode, setErrCode] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNote(null);
    setErrCode(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        addCreation({ id: data.id, prompt: prompt.trim(), ts: Date.now() });
        router.push(`/build/${data.id}`);
      } else {
        setNote(data.error ?? 'That prompt broke our pencil. Try again.');
        setErrCode(typeof data.code === 'string' ? data.code : null);
      }
    } catch {
      setNote('That prompt broke our pencil. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="hero draw-in" id="make">
      <h1>What do you want to play into existence?</h1>
      <form className="prompt-row" onSubmit={submit}>
        <div className="prompt-frame">
          <HandFrame seed="prompt-box" strokeWidth={1.8} />
          <input
            className="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="a penguin learning to fly, one throw at a time…"
            aria-label="Describe the game you want"
            maxLength={400}
          />
        </div>
        <button className="btn btn-biro" type="submit" disabled={busy}>
          {busy ? 'sharpening…' : 'Make a game'}
        </button>
      </form>
      <p className="hero-sub">
        {note ?? 'No downloads. No accounts to play. Share a link, dare a friend.'}
        {errCode === 'auth' && (
          <>
            {' '}
            <Link href="/login">Sign in →</Link>
          </>
        )}
        {errCode === 'credits' && (
          <>
            {' '}
            <Link href="/credits">Get credits →</Link>
          </>
        )}
      </p>
    </section>
  );
}
