import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, getGame } from '@/lib/db';
import { auth } from '@/lib/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { readJson } from '@/lib/http';

const GAMES_DIR = path.join(process.cwd(), 'games');

// Remix = fork any published game into a new DRAFT you own (with visible
// lineage via parent_slug). Requires an account — a remix creates real rows
// and real files, and its owner needs to exist to publish or edit it.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: 'Sign in to remix.', code: 'auth' }, { status: 401 });
  if (!rateLimit(`remix:${clientIp(req.headers)}`, 5, 3600_000)) {
    return NextResponse.json({ error: 'Too many remixes — take a breather.' }, { status: 429 });
  }
  const ref = session.user.id; // the remix's owner
  const body = await readJson(req);
  const srcSlug = typeof body?.slug === 'string' ? body.slug : '';
  const src = getGame(srcSlug);
  if (!src) return NextResponse.json({ error: 'unknown game' }, { status: 404 });

  const base = srcSlug.replace(/-remix.*$/, '');
  const newSlug = `${base}-remix-${crypto.randomBytes(2).toString('hex')}`;
  const srcDir = path.join(GAMES_DIR, srcSlug);
  const dstDir = path.join(GAMES_DIR, newSlug);
  try {
    fs.mkdirSync(dstDir);
  } catch {
    return NextResponse.json({ error: 'could not create remix' }, { status: 500 });
  }
  for (const f of ['cover.svg', 'DESIGN_BRIEF.md']) {
    const s = path.join(srcDir, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(dstDir, f));
  }
  // index.html: rewrite any hardcoded references to the source slug (localStorage
  // keys like gs_best:<slug> / gs_save:<slug>) to the new slug, so a remix keeps
  // its OWN saved data instead of colliding with the original's (the remix bug).
  const srcHtml = path.join(srcDir, 'index.html');
  if (fs.existsSync(srcHtml)) {
    const html = fs.readFileSync(srcHtml, 'utf8').split(srcSlug).join(newSlug);
    fs.writeFileSync(path.join(dstDir, 'index.html'), html);
  }
  // rewrite meta for the fork
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(srcDir, 'meta.json'), 'utf8'));
  } catch {
    /* fall back to DB columns below */
  }
  meta.slug = newSlug;
  meta.title = `${src.title} (remix)`;
  meta.author = 'creator';
  fs.writeFileSync(path.join(dstDir, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dstDir, 'published.json'), JSON.stringify({ remixOf: srcSlug, at: Date.now() }));

  db().prepare(
    `INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, boards, palette, author, status, creator_ref, parent_slug, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creator', 'draft', ?, ?, ?)`
  ).run(
    newSlug, `${src.title} (remix)`, src.description, src.verb, src.dials, src.orientation, src.mode,
    src.score_label, src.score_order, src.boards, src.palette, ref, srcSlug, Date.now()
  );
  return NextResponse.json({ ok: true, slug: newSlug });
}
