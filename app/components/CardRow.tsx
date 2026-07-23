import GameCard from './GameCard';
import type { FeedItem } from '@/lib/db';

// A horizontally-scrolling shelf of game cards (the Netflix row), in the
// sketchbook language: hairline-ruled header, wobble-framed covers.
export default function CardRow({ title, note, games }: { title: string; note?: string; games: FeedItem[] }) {
  if (games.length === 0) return null;
  return (
    <section className="card-row">
      <div className="feed-head">
        <h2>{title}</h2>
        <span className="rule" />
        {note && <span className="feed-note">{note}</span>}
      </div>
      <div className="row-scroll">
        {games.map((g) => (
          <GameCard key={g.slug} game={g} />
        ))}
      </div>
    </section>
  );
}
