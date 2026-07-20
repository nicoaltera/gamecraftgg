import { NextRequest, NextResponse } from 'next/server';
import { getUserGames } from '@/lib/db';

// Your published + draft games, by creator ref (login-less identity).
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  const games = getUserGames(ref).map((g) => ({
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
