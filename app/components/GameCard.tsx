import Link from 'next/link';
import HandFrame from './HandFrame';
import type { FeedItem } from '@/lib/db';

// Covers load straight from the game origin (no app-origin redirect hop). The
// host gate 308s app-origin /play requests to here anyway; going direct avoids
// a round-trip per card and the CSP allows this origin for img.
const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN?.replace(/\/$/, '') ?? '';

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return n.toLocaleString();
}

export default function GameCard({ game }: { game: FeedItem }) {
  return (
    <Link href={`/g/${game.slug}`} className="game-card draw-in">
      <div className="cover-wrap">
        <HandFrame seed={game.slug} />
        {/* covers are game-owned art; plain img keeps untrusted SVG scripts inert */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${GAME_ORIGIN}/play/${game.slug}/cover.svg`} alt={`${game.title} cover`} loading="lazy" />
        {/* penciled sticker: play count on the cover, like the big arcades do */}
        <span className="card-plays">▶ {game.total_plays > 0 ? compact(game.total_plays) : 'new'}</span>
      </div>
      <div className="card-title">{game.title}</div>
      <div className="card-sub">
        <span>{game.verb}</span>
        <span className="mono">{game.rating_count > 0 && <span className="card-rating">★ {game.rating.toFixed(1)}</span>}</span>
      </div>
    </Link>
  );
}
