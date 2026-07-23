import { getFeed } from '@/lib/db';
import GameCard from '@/components/GameCard';
import PromptHero from '@/components/PromptHero';

export const dynamic = 'force-dynamic';

// The landing page is two things: the prompt, and every game worth playing —
// one ranked grid, four columns on desktop, vertical scroll. Nothing else.
export default function Home() {
  const games = getFeed(500);
  return (
    <main>
      <PromptHero />
      <section id="games" className="card-row">
        <div className="feed-head">
          <h2>Top games</h2>
          <span className="rule" />
          <span className="feed-note">ranked by what people actually replay</span>
        </div>
        {games.length === 0 ? (
          <p className="about-game">No games yet — the first one is yours to make.</p>
        ) : (
          <div className="top-grid">
            {games.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
