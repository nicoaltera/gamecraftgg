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

- **18 curated + generated games** in `games/`, spanning the archetypes (mastery, progression, comedy/spectacle, toy, party-vs-bots, narrative). Each is a self-contained `index.html` + `meta.json` + `cover.svg` + a `published.json` publish marker. The contract is `CONVENTIONS.md`.
- `app/` — routes: home (prompt hero + retention/rating-ranked feed with star ratings + play counts), `/g/[slug]` game pages (challenge banner, leaderboard(s), half-star ratings, Send-to-a-friend + Remix, owner draft/publish/continue-editing, start-over), `/yours` your creations (drafts + published + in-progress builds), `/build/[id]` live build theater (streams the agent loop), `/k` K-factor dashboard, `/play/[slug]` sandboxed game serving (strict CSP + injected scroll-guard).
- **Player features:** multi-board leaderboards (metric matched to goal), half-star ratings (no comments), "start over" progress reset, challenge/share links with OG cards, retention+rating-ranked discovery feed.
- **Creator features:** generated games are **drafts** until the creator clicks **Publish**; **remix** any public game into your own draft (slug-rewritten so it's isolated); **continue-editing** by re-prompting your game (pipeline edit mode, snapshot-safe). Login-less ownership via a per-browser ref.
- `pipeline/run.mjs` — the generation pipeline: designer → builder → play-test harness → judge panel, up to 3 cycles, streams the loop to the build page, and only produces a (draft) game on judge pass; supports `--edit <slug>`. Requires the `claude` CLI.
- `scripts/` — `game-server.mjs` (production-identical static server) + `verify-game.mjs` (Playwright play-evidence harness). That's it.
- `lib/db.ts` — SQLite layer (portable schema; Postgres swap documented in ../05-architecture.md). Games table carries status (draft/published/unlisted), creator_ref, parent_slug, boards; plus ratings, plays, scores, referral_edges, generations.

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
