import { NextRequest, NextResponse } from 'next/server';
import { getUserGames } from '@/lib/db';
import { auth } from '@/lib/auth';

// Your published + draft games: the session user's games, plus any still owned
// by this browser's legacy anonymous ref. The ref param is only honored in its
// 8-hex anonymous shape — passing someone's USER id here returns nothing.
export async function GET(req: NextRequest) {
  const rawRef = req.nextUrl.searchParams.get('ref') ?? '';
  const legacyRef = /^[0-9a-f]{8}$/.test(rawRef) ? rawRef : '';
  const session = await auth.api.getSession({ headers: req.headers });

  const seen = new Set<string>();
  const games = [...(session ? getUserGames(session.user.id) : []), ...(legacyRef ? getUserGames(legacyRef) : [])]
    .filter((g) => !seen.has(g.slug) && seen.add(g.slug))
    .map((g) => ({
      slug: g.slug,
      title: g.title,
      verb: g.verb,
      status: g.status,
      rating: g.rating,
      ratingCount: g.ratingCount,
      parentSlug: g.parent_slug,
    }));
  return NextResponse.json({ games });
}
