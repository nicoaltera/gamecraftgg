'use client';

import { useCallback, useEffect, useState } from 'react';

type Entry = { name: string; score: number };
type Board = { key: string; label: string; order: 'asc' | 'desc'; primary: boolean };

export default function Leaderboard({ slug, boards }: { slug: string; boards: Board[] }) {
  const [boardKey, setBoardKey] = useState(boards.find((b) => b.primary)?.key ?? boards[0]?.key ?? '');
  const [tab, setTab] = useState<'all' | 'day'>('all');
  const [entries, setEntries] = useState<Entry[] | null>(null);

  const board = boards.find((b) => b.key === boardKey) ?? boards[0];

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (boardKey) q.set('board', boardKey);
    if (tab === 'day') q.set('window', 'day');
    fetch(`/api/leaderboard/${slug}${q.toString() ? `?${q}` : ''}`)
      .then((r) => r.json())
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]));
  }, [slug, boardKey, tab]);

  useEffect(() => {
    load();
    window.addEventListener('gs:board-refresh', load);
    return () => window.removeEventListener('gs:board-refresh', load);
  }, [load]);

  return (
    <div className="board">
      <h3>Leaderboard</h3>
      {boards.length > 1 && (
        <div className="board-picker">
          {boards.map((b) => (
            <button key={b.key} className={b.key === boardKey ? 'active' : ''} onClick={() => setBoardKey(b.key)}>
              {b.label}
            </button>
          ))}
        </div>
      )}
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
                {board?.label ? ` ${board.label}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
