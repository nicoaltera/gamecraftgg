import type { NextConfig } from 'next';

// Games are untrusted, machine-generated code. Two layers of defense:
//  1. Serve games from a SEPARATE origin (NEXT_PUBLIC_GAME_ORIGIN) so the
//     same-origin-policy isolates them from the app (parent DOM, app
//     localStorage, cookies). This is the real fix; set it in production.
//  2. App-wide CSP as defense-in-depth: even if a game runs same-origin in a
//     dev fallback, connect-src 'self' blocks exfiltration to third parties and
//     frame-ancestors 'self' blocks clickjacking of the score/dare controls.
const GAME_ORIGIN = process.env.NEXT_PUBLIC_GAME_ORIGIN?.trim() || '';
const frameSrc = ['\'self\'', GAME_ORIGIN].filter(Boolean).join(' ');

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src ${frameSrc}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
