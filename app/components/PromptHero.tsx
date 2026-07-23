'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import HandFrame from './HandFrame';
import { addCreation } from '@/lib/creations';
import { useSession } from '@/lib/auth-client';

// The key that carries a typed prompt through the login flow: hitting "Make a
// game" while signed out stashes the prompt here, opens /login, and this hero
// restores it when the player lands back — nothing they typed is lost.
const PENDING_KEY = 'gc_pending_prompt';

export default function PromptHero() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // 'credits' from the API turns the note into an actionable link
  const [errCode, setErrCode] = useState<string | null>(null);
  // gentle nudge (wobble + red pencil stroke) when the prompt is empty
  const [attn, setAttn] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    const saved = sessionStorage.getItem(PENDING_KEY);
    if (saved) {
      sessionStorage.removeItem(PENDING_KEY);
      setPrompt(saved);
      setNote('Welcome back — your prompt is right where you left it.');
    }
  }, []);

  function goSignIn(text: string) {
    sessionStorage.setItem(PENDING_KEY, text);
    router.push('/login?next=make');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const text = prompt.trim();
    if (text.length < 8) {
      setNote(text ? 'Give it a full sentence — what should the game feel like?' : 'First, type the game you want to play — one sentence is plenty.');
      setErrCode(null);
      setAttn(true);
      setTimeout(() => setAttn(false), 700);
      return;
    }
    // Signed out? Take them straight to sign-in with the prompt preserved.
    if (!session) {
      goSignIn(text);
      return;
    }
    setBusy(true);
    setNote(null);
    setErrCode(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        addCreation({ id: data.id, prompt: text, ts: Date.now() });
        router.push(`/build/${data.id}`);
      } else if (data.code === 'auth') {
        goSignIn(text); // stale session — same path, nothing lost
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
        <div className={`prompt-frame${attn ? ' attn' : ''}`}>
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
