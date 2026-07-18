# GameSight — app

The implementation of the planning docs one directory up. Next.js (webpack build) + SQLite + self-contained game bundles + an agentic generation pipeline.

## Run

```bash
cd app
npm install
npx playwright install chromium   # for the play-test harness
npm run build && PORT=3311 npm run start   # or: npm run dev
```

Open http://localhost:3311. The DB auto-creates at `data/gamesight.db` and seed games in `games/` auto-register on first request.

## What's here

- `app/` — routes: home (prompt hero + retention-ranked feed), `/g/[slug]` game pages (challenge banner, leaderboard, dare-a-friend), `/build/[id]` build theater, `/k` the K-factor dashboard, `/play/[slug]` sandboxed game serving (strict CSP: no network, inline+vendored scripts only).
- `games/<slug>/` — one folder per game: `index.html` (self-contained), `meta.json`, `cover.svg`. The contract is `CONVENTIONS.md`.
- `pipeline/run.mjs` — the generation pipeline: designer → builder → play-test harness → judge panel, up to 3 cycles, publishes only on pass. Requires the `claude` CLI. Also runnable directly: `node pipeline/run.mjs --prompt "..."`.
- `scripts/` — `game-server.mjs` (production-identical static server for game dev), `verify-game.mjs` (Playwright play-evidence harness: console errors, bridge messages, desktop+mobile screenshots).
- `lib/db.ts` — SQLite layer (portable schema; Postgres swap documented in ../05-architecture.md).

## Bridge contract (deviation from the planning docs, deliberate)

Games do NOT `POST /api/score` themselves — the CSP forbids all game network access. Instead games `postMessage` (`gs:'ready' | 'gameover' | 'score' | 'challenge_beaten'`) to the parent page, which owns sessions, heartbeats, submits, and share UI. Strictly better isolation than the original spec; `../05-architecture.md` reflects this.

## Security posture

Games are untrusted, machine-generated code. Two layers isolate them:

1. **Separate origin (the real fix).** Set `NEXT_PUBLIC_GAME_ORIGIN` to a distinct host in production (e.g. `https://play.gamesight.xyz`) so the same-origin policy walls games off from the app's DOM, `localStorage`, and cookies. The parent page validates `postMessage` origin against it. **This must be set before public launch** — unset (dev) falls back to same-origin, where `allow-same-origin` on the iframe does not isolate.
2. **Defense-in-depth CSP** (`next.config.ts`, applied even in the same-origin fallback): `connect-src 'self'` blocks any game from exfiltrating to third parties; `frame-ancestors 'self'` / `X-Frame-Options` block clickjacking of the score/dare controls. The game-serving route adds `connect-src 'none'` so a game makes no network calls at all.

Other hardening: report-to-unlist requires a real play session and counts distinct reporters; scores are quarantined on implausible values (absolute per-second ceiling + board outlier) and require a live session; all write endpoints bound their JSON body size; the generate daily-cap check is transactional; the pipeline claims game dirs atomically and scopes the judge's file access to the game folder.

## Honest status / known gaps

- **Auth/quota**: creation is capped (20 generations/day globally) but login is NOT implemented — Google/Apple OAuth needs founder credentials (07-open-questions.md). Player identity is localStorage-based. Per-IP rate limiting on write endpoints is not yet added (bodies are size-bounded; a reverse proxy or middleware should add rate limits before launch).
- **Generation from the web UI** spawns `pipeline/run.mjs` on this machine using the local `claude` CLI — real hosting needs the build-worker container from 05-architecture.md.
- Party rooms (Playroom) are Phase 2 per the roadmap; not in this build.
- The OG card renders in a system font (not Shantell) — satori font embedding is a documented polish follow-up; the card is otherwise on-brand (paper, ink frame, highlighter swipe on the dare).
- The `/k` dashboard counts a "share" when a dare link is created; share→player attribution flows through the `r=` param into sessions.
