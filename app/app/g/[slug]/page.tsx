import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getFeed, getGame, getGameAny, getMakerName, parseBoards } from '@/lib/db';
import GameStage from '@/components/GameStage';
import Leaderboard from '@/components/Leaderboard';
import NavRail from '@/components/NavRail';
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
    title: `${game.title} — GameCraft`,
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

  // The feed order IS the swipe order: chevrons walk the same ranking the
  // homepage shows. Drafts aren't in the feed — their viewer just has no next.
  const order = getFeed(100).map((g) => g.slug);
  const at = order.indexOf(slug);
  const prevSlug = at > 0 ? order[at - 1] : null;
  const nextSlug = at >= 0 && at < order.length - 1 ? order[at + 1] : at === -1 && order.length ? order[0] : null;

  return (
    <main className="game-page">
      <Link href="/#games" className="back-link">← all games</Link>
      <div className="game-title-row">
        <h1>{game.title}</h1>
        <span className="game-verb">
          {game.verb}
          {(() => {
            const maker = getMakerName(game.creator_ref);
            return maker ? (
              <>
                {game.verb ? ' · ' : ''}by <Link href={`/u/${encodeURIComponent(maker)}`}>{maker}</Link>
              </>
            ) : null;
          })()}
        </span>
      </div>
      <div className="viewer">
        {/* the game gets the full column; boards live BELOW the stage/actions */}
        <div>
          <GameStage
            slug={game.slug}
            title={game.title}
            boards={boards}
            status={game.status}
            creatorRef={game.creator_ref}
            orientation={game.orientation}
          />
          <GameActions slug={game.slug} title={game.title} status={game.status} creatorRef={game.creator_ref} parentSlug={game.parent_slug} />
          <div className="under-grid">
            <div>
              <p className="about-game">{game.description}</p>
              {isPublished && <ReportButton slug={game.slug} />}
            </div>
            <aside>
              {isPublished && <StarRating slug={game.slug} />}
              <Leaderboard slug={game.slug} boards={boards} />
            </aside>
          </div>
        </div>
        <NavRail prevSlug={prevSlug} nextSlug={nextSlug} />
      </div>
    </main>
  );
}
