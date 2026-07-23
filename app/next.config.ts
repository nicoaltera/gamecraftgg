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

// next dev serves eval-wrapped webpack chunks; without 'unsafe-eval' the app
// silently never hydrates in dev (chunks load fine, React never boots — a
// genuinely nasty one to debug). Production builds don't eval, so prod CSP
// stays strict.
const dev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
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
        // Everything EXCEPT /play/*. Game responses set their own CSP in the
        // play route handler (frame-ancestors 'self' + APP_ORIGIN); if the
        // app-wide CSP also landed there the browser would enforce BOTH
        // policies, and frame-ancestors 'self' + X-Frame-Options SAMEORIGIN
        // would silently block every game the moment they're framed from the
        // separate app origin.
        source: '/((?!play/).*)',
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
