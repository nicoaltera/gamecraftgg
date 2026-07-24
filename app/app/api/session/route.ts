import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { db, getGameAny } from '@/lib/db';
import { auth } from '@/lib/auth';
import { addEntry, SHARE_REWARD, SHARE_REWARD_DAILY_CAP } from '@/lib/credits';
import { rateLimit, clientIp, ipHash } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

// A play session is minted when a game page loads. Score submits require a
// live session — the cheapest honest layer of the accept-cheating-v1 posture.
// Per-IP limited: sessions are the raw material of fake engagement.
export async function POST(req: NextRequest) {
  if (!rateLimit(`sess:${clientIp(req.headers)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }
  const body = await readJson(req);
  const slug = typeof body?.slug === 'string' ? body.slug : null;
  if (!slug || !getGameAny(slug)) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const sessionId = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const ref = typeof body?.ref === 'string' ? body.ref.slice(0, 64) : null;
  db().prepare(
    'INSERT INTO plays (slug, session_id, ref, started_at, last_seen_at, is_mobile) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(slug, sessionId, ref, now, now, body?.isMobile ? 1 : 0);
  if (ref) {
    db().prepare('INSERT INTO referral_edges (slug, ref, kind, session_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(slug, ref, 'play', sessionId, now);
    await maybeShareReward(ref, slug, req);
  }
  return NextResponse.json({ sessionId });
}

// SHARE REWARD: signed-in sharers earn credits when their link converts into a
// real new player. Reward the outcome, never the click — clicks are free to
// farm and credits cost real dollars. Defenses, in order:
//  · the ref must be an actual account (share links carry the user id when
//    signed in; anonymous 8-hex refs never earn)
//  · not the sharer opening their own link while signed in
//  · once per (sharer, game, player-IP) forever — the ledger's UNIQUE key,
//    same idempotency spine as webhooks and refunds
//  · a daily cap: a super-sharer earns a free game a day, a farmer flatlines
async function maybeShareReward(ref: string, slug: string, req: NextRequest) {
  try {
    if (ref.length <= 8) return; // legacy anonymous ref — no account to credit
    const sharer = db().prepare('SELECT id FROM user WHERE id = ?').get(ref) as { id: string } | undefined;
    if (!sharer) return;
    const session = await auth.api.getSession({ headers: req.headers });
    if (session?.user.id === ref) return; // playing your own dare earns nothing
    const today = (db()
      .prepare("SELECT COUNT(*) AS c FROM credit_entries WHERE user_id = ? AND reason = 'share_reward' AND created_at > ?")
      .get(ref, Date.now() - 86400_000) as { c: number }).c;
    if (today >= SHARE_REWARD_DAILY_CAP) return;
    addEntry(ref, SHARE_REWARD, 'share_reward', `${slug}:${ref}:${ipHash(clientIp(req.headers))}`);
  } catch {
    /* a reward hiccup must never break session minting */
  }
}
