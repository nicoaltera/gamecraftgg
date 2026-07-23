import Link from 'next/link';
import { getFeed, getNewest, getMostPlayed, getDailyChampions } from '@/lib/db';
import CardRow from '@/components/CardRow';
import GameCard from '@/components/GameCard';
import PromptHero from '@/components/PromptHero';

export const dynamic = 'force-dynamic';

export default function Home() {
  const trending = getFeed(18); // ~3 rows of the top-games grid on desktop
  const newest = getNewest(12);
  const mostPlayed = getMostPlayed(12);
  const champions = getDailyChampions(8);
  // don't repeat the exact same shelf twice when the library is small
  const sameOrder = (a: { slug: string }[], b: { slug: string }[]) =>
    a.length === b.length && a.every((g, i) => g.slug === b[i].slug);

  return (
    <main>
      <PromptHero />
      <div className="home-grid" id="games">
        <div>
          {trending.length === 0 ? (
            <p className="about-game">No games yet — the first one is yours to make.</p>
          ) : (
            <>
              {/* the headline section is a wrapped grid (~3 rows), not a shelf */}
              <section className="card-row">
                <div className="feed-head">
                  <h2>Today’s top games</h2>
                  <span className="rule" />
                  <span className="feed-note">ranked by what people actually replay</span>
                </div>
                <div className="game-grid">
                  {trending.map((g) => (
                    <GameCard key={g.slug} game={g} />
                  ))}
                </div>
              </section>
              {!sameOrder(newest, trending.slice(0, newest.length)) && <CardRow title="Fresh off the pencil" games={newest} />}
              {!sameOrder(mostPlayed, trending.slice(0, mostPlayed.length)) && <CardRow title="Most played, ever" games={mostPlayed} />}
            </>
          )}
        </div>
        <aside className="rail">
          <div className="board">
            <h3>Today’s champions</h3>
            {champions.length === 0 ? (
              <p className="empty">No scores yet today — set one.</p>
            ) : (
              <ol>
                {champions.map((c) => (
                  <li key={c.slug}>
                    <span>
                      {c.name}
                      <br />
                      <Link href={`/g/${c.slug}`} className="board-game">
                        {c.title}
                      </Link>
                    </span>
                    <span className="score">
                      {c.score.toLocaleString()}
                      {c.label ? ` ${c.label}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
