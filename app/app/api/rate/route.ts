import { NextRequest, NextResponse } from 'next/server';
import { db, getGame, getRating } from '@/lib/db';
import { readJson } from '@/lib/http';

// Half-star ratings (0.5–5), one per player-ref (upsert). No comments.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : '';
  const stars = Number(body?.stars);
  if (!getGame(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  if (!ref) return NextResponse.json({ error: 'no ref' }, { status: 400 });
  if (!(stars >= 0.5 && stars <= 5) || Math.round(stars * 2) !== stars * 2)
    return NextResponse.json({ error: 'stars must be 0.5–5 in half steps' }, { status: 400 });

  db().prepare(
    `INSERT INTO ratings (slug, ref, stars, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(slug, ref) DO UPDATE SET stars = excluded.stars, created_at = excluded.created_at`
  ).run(slug, ref, stars, Date.now());
  return NextResponse.json({ ok: true, ...getRating(slug) });
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  if (!getGame(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });
  const mine = ref
    ? (db().prepare('SELECT stars FROM ratings WHERE slug = ? AND ref = ?').get(slug, ref) as { stars: number } | undefined)
    : undefined;
  return NextResponse.json({ ...getRating(slug), yours: mine?.stars ?? null });
}
