'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = { name: string; score: number };

export default function Leaderboard({ slug, scoreLabel }: { slug: string; scoreLabel: string }) {
  const [tab, setTab] = useState<'all' | 'day'>('all');
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const load = useCallback(() => {
    fetch(`/api/leaderboard/${slug}${tab === 'day' ? '?window=day' : ''}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]));
  }, [slug, tab]);

  useEffect(() => {
    load();
    window.addEventListener('gs:board-refresh', load);
    return () => window.removeEventListener('gs:board-refresh', load);
  }, [load]);

  return (
    <div className="board">
      <h3>Leaderboard</h3>
      <div className="board-tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          all time
        </button>
        <button className={tab === 'day' ? 'active' : ''} onClick={() => setTab('day')}>
          today
        </button>
      </div>
      {entries == null ? (
        <p className="empty">…</p>
      ) : entries.length === 0 ? (
        <p className="empty">Nobody has posted a score yet. Be the name everyone chases.</p>
      ) : (
        <ol>
          {entries.map((e, i) => (
            <li key={`${e.name}-${i}`}>
              <span>
                {i + 1}. {e.name}
              </span>
              <span className="score">
                {e.score.toLocaleString()}
                {scoreLabel ? ` ${scoreLabel}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
