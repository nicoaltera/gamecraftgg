import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { readJson } from '@/lib/http';

// Claims a browser's anonymous creations (creator_ref = localStorage gs_ref_id)
// into the signed-in account, so games made before sign-up aren't stranded.
// The ref is an unguessable-ish 8-hex browser id; the worst case of a forged
// claim is adopting someone's ANONYMOUS drafts — no credits or money move here.
// Never adopt refs that are themselves user ids (a second account signing in on
// a shared browser must not steal the first account's games — user ids are
// 32-char Better Auth ids, refs are 8 hex chars).
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: 'sign in first' }, { status: 401 });
  const body = await readJson(req);
  const ref = typeof body?.ref === 'string' ? body.ref : '';
  if (!/^[0-9a-f]{8}$/.test(ref)) return NextResponse.json({ adopted: 0 });
  const res = db().prepare('UPDATE games SET creator_ref = ? WHERE creator_ref = ?').run(session.user.id, ref);
  return NextResponse.json({ adopted: res.changes });
}
