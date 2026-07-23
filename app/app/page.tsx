import Link from 'next/link';
import { getFeed, getNewest, getMostPlayed, getDailyChampions } from '@/lib/db';
import CardRow from '@/components/CardRow';
import PromptHero from '@/components/PromptHero';

export const dynamic = 'force-dynamic';

export default function Home() {
  const trending = getFeed(12);
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
              <CardRow title="Hot right now" note="ranked by what people actually replay" games={trending} />
              {!sameOrder(newest, trending) && <CardRow title="Fresh off the pencil" games={newest} />}
              {!sameOrder(mostPlayed, trending) && <CardRow title="Most played, ever" games={mostPlayed} />}
            </>
          )}
        </div>
        <aside className="rail">
          <Link href="/#make" className="rail-make">
            ✎ Make a game
          </Link>
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
