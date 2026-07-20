'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { listCreations, type Creation } from '@/lib/creations';
import { getRef } from '@/lib/ref';

type Status = { status: 'running' | 'published' | 'failed' | 'archived'; slug: string | null };
type MyGame = { slug: string; title: string; verb: string; status: string; rating: number; ratingCount: number; parentSlug: string };

export default function YoursPage() {
  const [creations, setCreations] = useState<Creation[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [myGames, setMyGames] = useState<MyGame[]>([]);

  useEffect(() => {
    setCreations(listCreations());
    fetch(`/api/mine?ref=${getRef()}`)
      .then((r) => r.json())
      .then((d) => setMyGames(d.games ?? []))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async (list: Creation[]) => {
    const results = await Promise.all(
      list.map(async (c) => {
        try {
          const r = await fetch(`/api/generation/${c.id}`);
          // a 404 (stale localStorage id) is terminal — record it so polling can stop
          if (!r.ok) return [c.id, { status: 'archived' as const, slug: null }] as const;
          const d = await r.json();
          return [c.id, { status: d.status, slug: d.slug }] as const;
        } catch {
          return [c.id, null] as const;
        }
      })
    );
    setStatuses((prev) => {
      const next = { ...prev };
      for (const [id, s] of results) if (s) next[id] = s;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!creations) return;
    refresh(creations);
    // poll only while something is still building; every id resolves to a status
    // (404s become 'archived'), so this stops once nothing is running.
    const iv = setInterval(() => {
      const anyRunning = Object.values(statuses).some((s) => s.status === 'running');
      const allResolved = creations.every((c) => statuses[c.id]);
      if (anyRunning || !allResolved) refresh(creations);
      else clearInterval(iv);
    }, 3000);
    return () => clearInterval(iv);
  }, [creations, refresh, statuses]);

  if (!creations)
    return (
      <main className="game-page">
        <p className="about-game">…</p>
      </main>
    );

  return (
    <main className="game-page">
      <Link href="/#games" className="back-link">← all games</Link>
      <h1 className="display" style={{ fontSize: 30 }}>Your games</h1>
      <p className="about-game" style={{ margin: '8px 0 24px' }}>
        Games you’ve made. Ones still cooking keep building even if you leave this page — go play something while you wait.
      </p>

      {myGames.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, maxWidth: 720, marginBottom: 8 }}>
          {myGames.map((g) => (
            <li key={g.slug} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(26,24,21,0.12)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <Link href={`/g/${g.slug}`} style={{ color: 'var(--ink)', fontWeight: 500 }}>{g.title}</Link>
                <span style={{ color: 'var(--graphite)', fontSize: 13, marginLeft: 8 }}>
                  {g.status === 'draft' ? 'draft' : `● live${g.ratingCount > 0 ? ` · ★ ${g.rating.toFixed(1)}` : ''}`}
                </span>
              </span>
              <Link className={g.status === 'draft' ? 'btn' : 'btn btn-biro'} href={`/g/${g.slug}`}>
                {g.status === 'draft' ? 'Review & publish' : 'Open'}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creations.length === 0 && myGames.length === 0 ? (
        <p className="about-game">
          You haven’t made a game yet. <Link href="/#make">Make one →</Link>
        </p>
      ) : creations.length === 0 ? null : (
        <ul style={{ listStyle: 'none', padding: 0, maxWidth: 720 }}>
          {creations.map((c) => {
            const s = statuses[c.id];
            const state = s?.status ?? 'running';
            return (
              <li
                key={c.id}
                style={{
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  padding: '14px 0',
                  borderBottom: '1px solid rgba(26,24,21,0.12)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    “{c.prompt}”
                  </span>
                </span>
                {state === 'published' && s?.slug ? (
                  <Link className="btn btn-biro" href={`/g/${s.slug}`}>
                    Play it
                  </Link>
                ) : state === 'failed' || state === 'archived' ? (
                  <span style={{ color: 'var(--graphite)', fontSize: 14 }}>
                    didn’t make it —{' '}
                    <Link href="/#make">try again</Link>
                  </span>
                ) : (
                  <Link href={`/build/${c.id}`} style={{ fontSize: 14 }}>
                    <span className="gs-blink">●</span> building — watch
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
