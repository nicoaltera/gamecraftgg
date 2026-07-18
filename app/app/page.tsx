import { getFeed } from '@/lib/db';
import GameCard from '@/components/GameCard';
import PromptHero from '@/components/PromptHero';

export const dynamic = 'force-dynamic';

export default function Home() {
  const feed = getFeed(24);
  return (
    <main>
      <PromptHero />
      <section id="games">
        <div className="feed-head">
          <h2>Hot right now</h2>
          <span className="rule" />
          <span className="feed-note">ranked by what people actually replay</span>
        </div>
        {feed.length === 0 ? (
          <p className="about-game">No games yet — the first one is yours to make.</p>
        ) : (
          <div className="game-grid">
            {feed.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
