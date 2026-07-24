import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

// Stash up to 3 friend emails on a running build. When it goes live, the app
// emails them the link (see the pipeline finish path). Owner-only, and only
// while the build is still running — you're inviting people to YOUR game.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: 'sign in' }, { status: 401 });
  if (!rateLimit(`notify:${clientIp(req.headers)}`, 20, 3600_000)) {
    return NextResponse.json({ error: 'slow down' }, { status: 429 });
  }
  const body = await readJson(req);
  const id = typeof body?.id === 'string' ? body.id : '';
  const emails = Array.isArray(body?.emails) ? body.emails : [];
  const gen = db().prepare('SELECT user_id, status FROM generations WHERE id = ?').get(id) as
    | { user_id: string; status: string }
    | undefined;
  if (!gen) return NextResponse.json({ error: 'unknown build' }, { status: 404 });
  if (gen.user_id !== session.user.id) return NextResponse.json({ error: 'not your build' }, { status: 403 });
  if (gen.status !== 'running') return NextResponse.json({ error: 'already finished' }, { status: 409 });

  const clean = [...new Set(emails.map((e: unknown) => String(e).trim().toLowerCase()))]
    .filter((e) => EMAIL_RE.test(e) && e.length <= 120)
    .slice(0, 3);
  db().prepare('UPDATE generations SET notify_emails = ? WHERE id = ?').run(JSON.stringify(clean), id);
  return NextResponse.json({ ok: true, count: clean.length });
}
