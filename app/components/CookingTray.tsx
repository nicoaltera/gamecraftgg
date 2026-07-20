'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { listCreations, listDismissed, dismissCreation } from '@/lib/creations';

// A global, parallel-aware tray of your in-progress builds. It follows you
// across the site so you can "leave and go play" while games cook, shows each
// build's live phase, and flips to a "ready → play" badge when one finishes
// (with an optional browser notification). Multiple builds are handled as a
// list — start as many as you like.

type Status = 'running' | 'published' | 'failed';
type Build = { id: string; prompt: string; status: Status; slug: string | null; phase: string };

const PHASE: Record<string, string> = {
  designer: 'designing',
  builder: 'building',
  playtest: 'play-testing',
  judge: 'judging',
  publish: 'finishing up',
};

// Derive a friendly phase from the latest non-thinking trace event.
function phaseFromTrace(trace: string): string {
  try {
    const ev = JSON.parse(trace || '[]') as { kind: string; stream?: string }[];
    for (let i = ev.length - 1; i >= 0; i--) {
      const k = ev[i].kind;
      if (PHASE[k]) return PHASE[k];
    }
  } catch {
    /* ignore */
  }
  return 'starting';
}

const ACTIVE_WINDOW = 3 * 60 * 60 * 1000; // only track builds started in the last 3h

export default function CookingTray() {
  const [builds, setBuilds] = useState<Record<string, Build>>({});
  const [open, setOpen] = useState(true);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const notified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) setPerm(Notification.permission);
  }, []);

  // Which builds do we still care about? Recent, not dismissed.
  const trackedIds = useCallback(() => {
    const dismissed = new Set(listDismissed());
    const now = Date.now();
    return listCreations().filter((c) => !dismissed.has(c.id) && now - c.ts < ACTIVE_WINDOW);
  }, []);

  const poll = useCallback(async () => {
    const tracked = trackedIds();
    if (tracked.length === 0) {
      setBuilds((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    // Only hit the network for builds we don't already know are terminal.
    const results = await Promise.all(
      tracked.map(async (c) => {
        const known = buildsRef.current[c.id];
        if (known && known.status !== 'running') return known;
        try {
          const res = await fetch(`/api/generation/${c.id}`);
          if (!res.ok) return null;
          const g = await res.json();
          const b: Build = {
            id: c.id,
            prompt: c.prompt || g.prompt || 'your game',
            status: g.status as Status,
            slug: g.slug ?? null,
            phase: phaseFromTrace(g.trace),
          };
          // Fire a one-time notification on the running → done transition.
          if (b.status !== 'running' && !notified.current.has(c.id)) {
            notified.current.add(c.id);
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              const title = b.status === 'published' ? '✎ Your game is ready to play' : 'A build didn’t make the cut';
              try {
                new Notification(title, { body: b.prompt, tag: `gs-${c.id}` });
              } catch {
                /* notifications can throw if constructed off a user gesture on some browsers */
              }
            }
          }
          return b;
        } catch {
          return known ?? null;
        }
      })
    );
    const next: Record<string, Build> = {};
    for (const b of results) if (b) next[b.id] = b;
    setBuilds(next);
  }, [trackedIds]);

  // Keep a ref of the latest builds so poll() can read terminal state without re-subscribing.
  const buildsRef = useRef(builds);
  buildsRef.current = builds;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      await poll();
    };
    tick();
    const iv = setInterval(tick, 3500);
    const onChange = () => tick();
    window.addEventListener('gs:creations-changed', onChange);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener('gs:creations-changed', onChange);
    };
  }, [poll]);

  const list = Object.values(builds).sort((a, b) => {
    // ready games first, then running, then failed
    const rank = (s: Status) => (s === 'published' ? 0 : s === 'running' ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  if (list.length === 0) return null;

  const cooking = list.filter((b) => b.status === 'running').length;
  const ready = list.filter((b) => b.status === 'published').length;

  async function askNotify() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPerm(p);
  }

  return (
    <aside className={`cook-tray${open ? '' : ' cook-collapsed'}`} aria-live="polite">
      <button className="cook-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cook-pen" aria-hidden>✎</span>
        <span className="cook-title">
          {ready > 0 && cooking === 0 && `${ready} game${ready > 1 ? 's' : ''} ready`}
          {cooking > 0 && `${cooking} game${cooking > 1 ? 's' : ''} cooking${ready ? ` · ${ready} ready` : ''}`}
          {cooking === 0 && ready === 0 && 'builds'}
        </span>
        <span className="cook-toggle" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="cook-body">
          {list.map((b) => (
            <div key={b.id} className={`cook-row cook-${b.status}`}>
              {b.status === 'running' && (
                <Link href={`/build/${b.id}`} className="cook-link">
                  <span className="cook-spinner" aria-hidden>✎</span>
                  <span className="cook-prompt">“{b.prompt}”</span>
                  <span className="cook-phase">{b.phase}…</span>
                </Link>
              )}
              {b.status === 'published' && (
                <Link href={b.slug ? `/g/${b.slug}` : `/build/${b.id}`} className="cook-link cook-ready-link">
                  <span className="cook-check" aria-hidden>✔</span>
                  <span className="cook-prompt">“{b.prompt}”</span>
                  <span className="cook-play">ready — play ▸</span>
                </Link>
              )}
              {b.status === 'failed' && (
                <Link href={`/build/${b.id}`} className="cook-link">
                  <span className="cook-x" aria-hidden>✕</span>
                  <span className="cook-prompt">“{b.prompt}”</span>
                  <span className="cook-phase">didn’t ship — tweak &amp; retry</span>
                </Link>
              )}
              {b.status !== 'running' && (
                <button className="cook-dismiss" aria-label="Dismiss" onClick={() => dismissCreation(b.id)}>
                  ×
                </button>
              )}
            </div>
          ))}

          {cooking > 0 && perm === 'default' && (
            <button className="cook-notify" onClick={askNotify}>
              🔔 Notify me when they’re ready
            </button>
          )}
          {cooking > 0 && (
            <p className="cook-foot">Keeps building even if you leave — go play something.</p>
          )}
        </div>
      )}
    </aside>
  );
}
