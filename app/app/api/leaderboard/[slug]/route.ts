import { NextRequest, NextResponse } from 'next/server';
import { getGame, getLeaderboard } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  const window = req.nextUrl.searchParams.get('window') === 'day' ? 'day' : undefined;
  return NextResponse.json({
    scoreLabel: game.score_label,
    entries: getLeaderboard(slug, game.score_order, window),
  });
}
