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

  const body = fs.readFileSync(filePath);
  return new NextResponse(body, {
    headers: {
      'content-type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'content-security-policy': CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'public, max-age=60',
    },
  });
}
