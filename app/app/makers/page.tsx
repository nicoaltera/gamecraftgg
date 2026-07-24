import Link from 'next/link';
import type { Metadata } from 'next';
import { getTopMakers } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Top makers — GameCraft' };

// The leaderboard of PEOPLE — gamertags ranked by how much the community plays
// their games. The scoreboard the game leaderboards feed into.
export default function MakersPage() {
  const makers = getTopMakers(50);
  return (
    <main className="makers-page">
      <div className="feed-head">
        <h2>Top makers</h2>
        <span className="rule" />
        <span className="feed-note">ranked by plays across their games</span>
      </div>
      {makers.length === 0 ? (
        <p className="about-game">No makers yet — be the first name on the board.</p>
      ) : (
        <ol className="makers-list">
          {makers.map((m, i) => (
            <li key={m.name}>
              <span className={`maker-rank${i === 0 ? ' top' : ''}`}>{i + 1}</span>
              <Link href={`/u/${encodeURIComponent(m.name)}`} className="maker-name">
                {m.name}
              </Link>
              <span className="maker-stat mono">{m.plays.toLocaleString()} {m.plays === 1 ? 'play' : 'plays'}</span>
              <span className="maker-stat mono dim">{m.games} {m.games === 1 ? 'game' : 'games'}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
