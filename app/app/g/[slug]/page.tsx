import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getGame } from '@/lib/db';
import GameStage from '@/components/GameStage';
import Leaderboard from '@/components/Leaderboard';
import ReportButton from '@/components/ReportButton';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ c?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { c } = await searchParams;
  const game = getGame(slug);
  if (!game) return {};
  const challenge = c && /^\d+$/.test(c) ? c : undefined;
  const title = challenge
    ? `Beat ${Number(challenge).toLocaleString()}${game.score_label ? ` ${game.score_label}` : ''} on ${game.title}`
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
  const game = getGame(slug);
  if (!game) notFound();

  return (
    <main className="game-page">
      <Link href="/#games" className="back-link">← all games</Link>
      <div className="game-title-row">
        <h1>{game.title}</h1>
        <span className="game-verb">{game.verb}</span>
      </div>
      <div className="game-columns">
        <div>
          <GameStage slug={game.slug} title={game.title} scoreLabel={game.score_label} scoreOrder={game.score_order} />
          <p className="about-game">{game.description}</p>
          <ReportButton slug={game.slug} />
        </div>
        <aside>
          <Leaderboard slug={game.slug} scoreLabel={game.score_label} />
        </aside>
      </div>
    </main>
  );
}
