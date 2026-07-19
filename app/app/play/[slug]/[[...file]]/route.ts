import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// Serves game bundles. Games are untrusted generated code: strict CSP means a
// game can run itself (inline script + vendored libs) and nothing else — no
// network, no navigation. Production upgrade path: move to a separate origin
// (05-architecture.md); the CSP here is the local-prod equivalent.
const GAMES_DIR = path.join(process.cwd(), 'games');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; file?: string[] }> }) {
  const { slug, file } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new NextResponse('not found', { status: 404 });
  const rel = (file ?? ['index.html']).join('/');
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
    else body = html.replace(/(<!doctype[^>]*>)/i, `$1${shim}`) === html ? shim + html : html.replace(/(<!doctype[^>]*>)/i, `$1${shim}`);
  }

  return new NextResponse(body, {
    headers: {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=60',
    },
  });
}
