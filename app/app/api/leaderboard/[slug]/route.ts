import { NextRequest, NextResponse } from 'next/server';
import { getGame, getLeaderboard, parseBoards } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGame(slug);
  if (!game) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  const boards = parseBoards(game);
  const window = req.nextUrl.searchParams.get('window') === 'day' ? 'day' : undefined;
  const key = req.nextUrl.searchParams.get('board') ?? boards.find((b) => b.primary)!.key;
  const board = boards.find((b) => b.key === key) ?? boards.find((b) => b.primary)!;
  return NextResponse.json({
    board: { key: board.key, label: board.label, order: board.order },
    boards: boards.map((b) => ({ key: b.key, label: b.label, order: b.order, primary: b.primary })),
    entries: getLeaderboard(slug, board.order, window, board.key),
  });
}
