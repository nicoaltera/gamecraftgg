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
        if (alive && data.status === 'running') setTimeout(poll, 2000);
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

  const events = JSON.parse(gen.trace || '[]') as { t: number; kind: string; detail: string }[];

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

      <ol style={{ listStyle: 'none', padding: 0, marginTop: 28, maxWidth: 720 }}>
        {events.map((e, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid rgba(26,24,21,0.12)',
              alignItems: 'baseline',
            }}
          >
            <span
              className="display"
              style={{ minWidth: 110, color: e.kind === 'error' || e.kind === 'fail' ? 'var(--redpencil)' : 'var(--biro)' }}
            >
              {KIND_LABEL[e.kind] ?? e.kind}
            </span>
            <span style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{e.detail}</span>
          </li>
        ))}
        {gen.status === 'running' && (
          <li style={{ padding: '14px 0', color: 'var(--graphite)', fontSize: 15 }}>working…</li>
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
