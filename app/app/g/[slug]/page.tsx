import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame, getGameAny, parseBoards } from '@/lib/db';
import GameStage from '@/components/GameStage';
import Leaderboard from '@/components/Leaderboard';
import ReportButton from '@/components/ReportButton';
import StarRating from '@/components/StarRating';
import GameActions from '@/components/GameActions';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { c } = await searchParams;
  const game = getGame(slug);
  if (!game) return {};
  const challenge = c && /^\d+$/.test(c) ? c : undefined;
  // the dare uses the challenge board — label the card with ITS unit, not the legacy score_label
  const dareLabel = parseBoards(game).find((b) => b.challenge)?.label ?? game.score_label;
  const title = challenge
    ? `Beat ${Number(challenge).toLocaleString()}${dareLabel ? ` ${dareLabel}` : ''} on ${game.title}`
    : `${game.title} — play it now`;
  const ogUrl = `/api/og/${slug}${challenge ? `?c=${challenge}` : ''}`;
  return {
    title: `${game.title} — GameSight`,
    description: game.description,
    openGraph: { title, description: game.description, images: [{ url: ogUrl, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description: game.description, images: [ogUrl] },
  };
}

export default async function GamePage({ params }: Params) {
  const { slug } = await params;
  const game = getGameAny(slug); // owners can view their own drafts
  if (!game) notFound();
  const boards = parseBoards(game);
  const isPublished = game.status === 'published';

  return (
    <main className="game-page">
      <Link href="/#games" className="back-link">← all games</Link>
      <div className="game-title-row">
        <h1>{game.title}</h1>
        <span className="game-verb">{game.verb}</span>
      </div>
      <div className="game-columns">
        <div>
          <GameStage slug={game.slug} title={game.title} boards={boards} status={game.status} creatorRef={game.creator_ref} />
          <GameActions slug={game.slug} title={game.title} status={game.status} creatorRef={game.creator_ref} parentSlug={game.parent_slug} />
          <p className="about-game">{game.description}</p>
          {isPublished && <ReportButton slug={game.slug} />}
        </div>
        <aside>
          {isPublished && <StarRating slug={game.slug} />}
          <Leaderboard slug={game.slug} boards={boards} />
        </aside>
      </div>
    </main>
  );
}
