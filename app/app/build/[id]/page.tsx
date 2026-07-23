'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BuildLoop, { type LoopStage } from '@/components/BuildLoop';

// The build theater (01-product-spec): the LOOP is the show — which agent has
// the pen right now, how far along we are against the ~25-minute average —
// and the raw agent stream is footnotes in a scrollable notebook below.
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

const AVG_MS = 25 * 60 * 1000; // the honest average — shown to the creator

function fmtLeft(ms: number): string {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gen, setGen] = useState<Gen | null>(null);
  const [missing, setMissing] = useState(false);
  const [showThinking, setShowThinking] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const boxRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true); // auto-scroll unless the reader scrolled up

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
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [id]);

  // keep the notebook pinned to the newest line while the reader is at the bottom
  useEffect(() => {
    const box = boxRef.current;
    if (box && followRef.current) box.scrollTop = box.scrollHeight;
  });

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

  // current loop stage = the last stage-boundary event
  const stageEvents = allEvents.filter((e) => !e.stream);
  const lastStage = [...stageEvents].reverse().find((e) => ['designer', 'builder', 'playtest', 'judge'].includes(e.kind));
  const stage = (lastStage?.kind ?? 'designer') as LoopStage;

  // progress vs the average
  const startT = allEvents[0]?.t ?? now;
  const elapsed = Math.max(0, now - startT);
  const running = gen.status === 'running';
  const pct = running ? Math.min(97, (elapsed / AVG_MS) * 100) : 100;
  const overTime = running && elapsed >= AVG_MS;

  const streamStyle: Record<string, { label: string; color: string; italic?: boolean }> = {
    thinking: { label: 'thinking', color: 'var(--graphite)', italic: true },
    tool: { label: 'tool', color: 'var(--biro)' },
    say: { label: 'says', color: 'var(--ink)' },
  };

  return (
    <main className="game-page">
      <h1 className="display" style={{ fontSize: 30 }}>
        {running && 'Drawing your game…'}
        {gen.status === 'published' && 'Your game is ready.'}
        {gen.status === 'failed' && 'This one did not make the cut.'}
      </h1>
      <p className="about-game" style={{ marginTop: 8 }}>
        “{gen.prompt}”
      </p>

      <BuildLoop stage={stage} cycles={gen.cycles || 1} status={gen.status} />

      <div className="build-progress">
        <div className="build-bar">
          <div
            className={`build-bar-fill${overTime ? ' almost' : ''}${gen.status === 'published' ? ' done' : ''}${gen.status === 'failed' ? ' failed' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="build-eta">
          {running && !overTime && (
            <>
              <span>an average game takes about 25 minutes</span>
              <span className="eta-count">~{fmtLeft(AVG_MS - elapsed)} left</span>
            </>
          )}
          {running && overTime && <span>Almost there… the judges are being thorough.</span>}
          {gen.status === 'published' && <span className="eta-count">Done.</span>}
          {gen.status === 'failed' && <span>Didn’t pass the judges — your credits are back in your account.</span>}
        </div>
      </div>

      {running && (
        <div className="build-leave">
          <span>This keeps building even if you leave — go play while you wait, we’ll ping you.</span>
          <Link className="btn" href="/#games">Play other games</Link>
          <Link className="btn" href="/yours">Your games</Link>
        </div>
      )}

      {gen.status === 'published' && gen.slug && (
        <p style={{ margin: '18px 0 4px' }}>
          <Link className="btn btn-biro" href={`/g/${gen.slug}`}>
            Play it now
          </Link>
        </p>
      )}
      {gen.status === 'failed' && (
        <p className="about-game" style={{ marginTop: 14 }}>
          The judges would not sign off, so nothing shipped and nothing was charged. Adjust the idea and try again — a different
          twist usually does it.
        </p>
      )}

      {gen.brief && (
        <details className="build-brief" open={!running}>
          <summary>the plan</summary>
          <p>{gen.brief.length > 900 ? gen.brief.slice(0, 900).trimEnd() + '…' : gen.brief}</p>
        </details>
      )}

      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginTop: 18, fontSize: 13, color: 'var(--graphite)' }}>
        <input type="checkbox" checked={showThinking} onChange={(e) => setShowThinking(e.target.checked)} />
        show the agents’ notes
      </label>

      <div
        className="trace-box"
        ref={boxRef}
        onScroll={() => {
          const box = boxRef.current;
          if (box) followRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        }}
      >
        <ol style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
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
          {running && (
            <li style={{ padding: '14px 0 14px 18px', color: 'var(--graphite)', fontSize: 14 }}>
              <span className="gs-blink">▍</span> working…
            </li>
          )}
        </ol>
      </div>
    </main>
  );
}
