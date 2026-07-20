'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

// The build theater (01-product-spec): watching the agents design, build,
// play-test, and judge is spectator content. Notebook-timeline styling.
type Gen = {
  id: string;
  slug: string | null;
  prompt: string;
  status: 'running' | 'published' | 'failed';
  brief: string | null;
  trace: string;
  cycles: number;
  verdict: string | null;
};

const KIND_LABEL: Record<string, string> = {
  designer: 'designer',
  builder: 'builder',
  playtest: 'play-tester',
  judge: 'judges',
  publish: 'published',
  fail: 'not published',
  error: 'error',
};

export default function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gen, setGen] = useState<Gen | null>(null);
  const [missing, setMissing] = useState(false);
  const [showThinking, setShowThinking] = useState(true);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/generation/${id}`);
        if (res.status === 404) {
          setMissing(true);
          return;
        }
        const data = (await res.json()) as Gen;
        if (alive) setGen(data);
        if (alive && data.status === 'running') setTimeout(poll, 1200);
      } catch {
        if (alive) setTimeout(poll, 4000);
      }
    }
    poll();
    return () => {
      alive = false;
    };
  }, [id]);

  if (missing)
    return (
      <main className="game-page">
        <h1 className="display">That build does not exist.</h1>
      </main>
    );
  if (!gen)
    return (
      <main className="game-page">
        <p className="about-game">Opening the workshop…</p>
      </main>
    );

  type Ev = { t: number; kind: string; detail: string; stream?: 'thinking' | 'tool' | 'say' };
  const allEvents = JSON.parse(gen.trace || '[]') as Ev[];
  const events = showThinking ? allEvents : allEvents.filter((e) => e.stream !== 'thinking');
  const streamStyle: Record<string, { label: string; color: string; italic?: boolean }> = {
    thinking: { label: 'thinking', color: 'var(--graphite)', italic: true },
    tool: { label: 'tool', color: 'var(--biro)' },
    say: { label: 'says', color: 'var(--ink)' },
  };

  return (
    <main className="game-page">
      <h1 className="display" style={{ fontSize: 30 }}>
        {gen.status === 'running' && 'Drawing your game…'}
        {gen.status === 'published' && 'Your game is live.'}
        {gen.status === 'failed' && 'This one did not make the cut.'}
      </h1>
      <p className="about-game" style={{ marginTop: 8 }}>
        “{gen.prompt}”
      </p>

      {gen.status === 'running' && (
        <div className="build-leave">
          <span>This keeps building even if you leave — go play while you wait, we’ll ping you.</span>
          <Link className="btn" href="/#games">Play other games</Link>
          <Link className="btn" href="/yours">Your games</Link>
        </div>
      )}

      {gen.brief && (
        <section className="build-brief">
          <h2>the plan ✎</h2>
          <p>{gen.brief.length > 600 ? gen.brief.slice(0, 600).trimEnd() + '…' : gen.brief}</p>
        </section>
      )}

      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 18, fontSize: 13, color: 'var(--graphite)' }}>
        <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} />
        show thinking
      </label>

      <ol style={{ listStyle: 'none', padding: 0, marginTop: 16, maxWidth: 760 }}>
        {events.map((e, i) => {
          if (e.stream) {
            const s = streamStyle[e.stream] ?? streamStyle.say;
            return (
              <li key={i} style={{ display: 'flex', gap: 12, padding: '3px 0 3px 18px', alignItems: 'baseline' }}>
                <span className="mono" style={{ minWidth: 74, fontSize: 11, color: s.color, textTransform: 'lowercase' }}>{s.label}</span>
                <span style={{ fontSize: 13.5, color: s.color, fontStyle: s.italic ? 'italic' : 'normal', whiteSpace: 'pre-wrap' }}>{e.detail}</span>
              </li>
            );
          }
          return (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 16,
                padding: '12px 0 4px',
                marginTop: 6,
                borderTop: '1px solid rgba(26,24,21,0.12)',
                alignItems: 'baseline',
              }}
            >
              <span
                className="display"
                style={{ minWidth: 110, color: e.kind === 'error' || e.kind === 'fail' ? 'var(--redpencil)' : 'var(--biro)' }}
              >
                {KIND_LABEL[e.kind] ?? e.kind}
              </span>
              <span style={{ fontSize: 15, whiteSpace: 'pre-wrap', fontWeight: 500 }}>{e.detail}</span>
            </li>
          );
        })}
        {gen.status === 'running' && (
          <li style={{ padding: '14px 0 14px 18px', color: 'var(--graphite)', fontSize: 14 }}>
            <span className="gs-blink">▍</span> working…
          </li>
        )}
      </ol>

      {gen.status === 'published' && gen.slug && (
        <p style={{ marginTop: 28 }}>
          <Link className="btn btn-biro" href={`/g/${gen.slug}`}>
            Play it now
          </Link>
        </p>
      )}
      {gen.status === 'failed' && (
        <p className="about-game" style={{ marginTop: 20 }}>
          The judges would not sign off, so nothing shipped. Adjust the idea and try again — a different twist usually does it.
        </p>
      )}
    </main>
  );
}
