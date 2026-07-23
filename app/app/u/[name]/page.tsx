import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProfile } from '@/lib/db';
import GameCard from '@/components/GameCard';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} — GameCraft` };
}

// Public maker page: every player gets one at /u/<gamertag>. Kept deliberately
// simple — the games ARE the profile.
export default async function ProfilePage({ params }: Params) {
  const { name } = await params;
  const profile = getProfile(decodeURIComponent(name));
  if (!profile) notFound();

  return (
    <main className="profile-page">
      <header className="profile-head draw-in">
        <h1>{profile.name}</h1>
        <p className="profile-stats mono">
          maker <span className="swipe">#{profile.rank}</span> of {profile.makers} &nbsp;·&nbsp; {profile.totalPlays.toLocaleString()}{' '}
          {profile.totalPlays === 1 ? 'play' : 'plays'} &nbsp;·&nbsp; {profile.games.length}{' '}
          {profile.games.length === 1 ? 'game' : 'games'}
        </p>
      </header>
      {profile.games.length === 0 ? (
        <p className="about-game">Nothing published yet — their first game is still cooking.</p>
      ) : (
        <div className="top-grid">
          {profile.games.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </div>
      )}
    </main>
  );
}
