import Link from 'next/link';
import HandFrame from './HandFrame';
import type { FeedItem } from '@/lib/db';

export default function GameCard({ game }: { game: FeedItem }) {
  return (
    <Link href={`/g/${game.slug}`} className="game-card draw-in">
      <div className="cover-wrap">
        <HandFrame seed={game.slug} />
        {/* covers are game-owned art; plain img keeps untrusted SVG scripts inert */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/play/${game.slug}/cover.svg`} alt={`${game.title} cover`} loading="lazy" />
      </div>
      <div className="card-title">{game.title}</div>
      <div className="card-sub">
        <span>{game.verb}</span>
        <span className="mono">{game.plays > 0 ? `${game.plays} ${game.plays === 1 ? 'play' : 'plays'}` : 'new'}</span>
      </div>
    </Link>
  );
}
