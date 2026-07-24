import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { verifyDraftToken } from '@/lib/internal-auth';

// Serves game bundles. Games are untrusted generated code — THREE layers:
//  1. HOST GATE: when a dedicated game origin is configured, this route only
//     serves from that hostname; requests on the app origin get a 308 to the
//     game origin. A generated game can therefore never execute with the
//     application's origin (cookies, localStorage), even opened top-level.
//  2. CSP: no network (connect-src 'none'), no forms, no <base> tricks, and a
//     sandbox equivalent to the embedding iframe's.
//  3. DRAFT PRIVACY: unpublished games require a signed, expiring owner token
//     (cover art is the one public exception — it's inert artwork).
const GAMES_DIR = path.join(process.cwd(), 'games');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || '';
const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN?.trim() || '';
const GAME_HOST = GAME_ORIGIN.replace(/^https?:\/\//, '').replace(/\/$/, '');

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  'sandbox allow-scripts allow-same-origin',
  `frame-ancestors 'self'${APP_ORIGIN ? ' ' + APP_ORIGIN : ''}`,
].join('; ');

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; file?: string[] }> }) {
  const { slug, file } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new NextResponse('not found', { status: 404 });
  const rel = (file ?? ['index.html']).join('/');

  // 1. host gate — only the dedicated game origin serves game bytes
  if (GAME_HOST) {
    const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
    if (host !== GAME_HOST) {
      const url = new URL(req.nextUrl.pathname + req.nextUrl.search, GAME_ORIGIN);
      return NextResponse.redirect(url, 308);
    }
  }

  // 3. draft privacy — a row exists for every published or draft game; only
  // published games are public. Drafts need the owner's signed token (minted
  // on the game page, carried on the iframe URL). No row at all = not served.
  const row = db().prepare('SELECT status FROM games WHERE slug = ?').get(slug) as { status: string } | undefined;
  if (!row) return new NextResponse('not found', { status: 404 });
  if (row.status !== 'published' && rel !== 'cover.svg') {
    const dt = req.nextUrl.searchParams.get('dt') ?? '';
    if (!verifyDraftToken(slug, dt)) return new NextResponse('not found', { status: 404 });
  }

  const filePath = path.resolve(GAMES_DIR, slug, rel);
  if (!filePath.startsWith(path.resolve(GAMES_DIR, slug) + path.sep) || rel.includes('_shots'))
    return new NextResponse('not found', { status: 404 });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory())
    return new NextResponse('not found', { status: 404 });

  const ext = path.extname(filePath);
  const raw = fs.readFileSync(filePath);
  let body: string | ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

  // Inject a scroll-key guard into every game's HTML: arrows / space / pageup-down
  // used for gameplay must not chain-scroll the parent page (a non-scrollable
  // iframe propagates keyboard scroll to its embedder). Capture-phase
  // preventDefault stops the scroll WITHOUT blocking the game's own key handlers.
  if (ext === '.html') {
    const shim =
      `<script>(function(){var k={ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1," ":1,Spacebar:1,PageUp:1,PageDown:1};` +
      `window.addEventListener("keydown",function(e){var t=e.target,n=t&&t.tagName;` +
      `if(n==="INPUT"||n==="TEXTAREA"||(t&&t.isContentEditable))return;` +
      `if(k[e.key])e.preventDefault();},{capture:true,passive:false});})();</script>`;
    // insert after <head>, else after <body>, else after <html> — never before
    // the doctype (that would trigger quirks mode and break canvas sizing).
    const html = raw.toString('utf8');
    if (/<head[^>]*>/i.test(html)) body = html.replace(/(<head[^>]*>)/i, `$1${shim}`);
    else if (/<body[^>]*>/i.test(html)) body = html.replace(/(<body[^>]*>)/i, `$1${shim}`);
    else if (/<html[^>]*>/i.test(html)) body = html.replace(/(<html[^>]*>)/i, `$1${shim}`);
    else body = shim + html;
  }

  return new NextResponse(body, {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      // drafts must never be cached by shared caches; published games may be
      'cache-control': row.status === 'published' ? 'public, max-age=60' : 'private, no-store',
    },
  });
}
