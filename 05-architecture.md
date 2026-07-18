# 05 — Platform Architecture (deliberately thin)

The platform's job is hosting, identity, scores, links, rooms, and the agent pipeline. Games are self-contained; keep the platform boring.

## Components

- **Web app:** Next.js (or equivalent). Pages: home/feed, game page, build page (live theater), creator dashboard (minimal: your games + quota), auth.
- **DB:** Postgres. Core tables: `users`, `games` (slug, versions, design brief, rubric scores, status), `scores` (game, name, score, ts, session meta), `plays` (game, session, duration, retries, referrer edge), `referral_edges` (sharer → clicker → outcomes — the K-factor graph), `generations` (prompt, cycles, cost, verdicts).
- **Game storage/serving:** each published version is one `index.html` on object storage behind a CDN, served from a sandboxed subdomain (e.g. `play.gamesight.xyz/g/<slug>/`) so game code never runs on the app origin. Strict CSP: allow only the pinned CDN whitelist + platform API. Previous version stays live until a new version passes verification.
- **Build workers:** containerized agent sessions (builder/designer/judges + a real browser for the play-tester). One container per generation; hard wall-clock and token budgets. Streams progress events to the build page over SSE/WebSocket.
- **APIs:**
  - `POST /api/score` — per-game public key, session-signed; returns rank
  - `GET /api/leaderboard/<slug>` — daily + all-time
  - `POST /api/challenge` — mints challenge URL + OG card
  - `POST /api/report` — abuse reporting
  - feed-ranking job (cron): retention-weighted score per game + new-release exposure window
- **Party rooms:** Playroom Kit loaded from CDN inside the game bundle. No platform backend for multiplayer in v1. Room ID rides the URL; platform just renders the invite/share UI around the frame.

## Anti-cheat posture (v1: accept cheating, design around it)

Client-reported scores are spoofable by construction (see `research/framework-infra.md` §4). V1 stance:
- Per-game boards with daily tabs — a cheater poisons one board for one day, no persistent economy exists.
- Anomaly heuristics on submit: score-vs-play-duration outliers, impossible submit cadence, z-score caps. Flagged scores are quarantined (visible to the submitter, hidden from others) — no confrontation loop.
- Play sessions carry a server-issued session token; score submits without a matching play session are dropped.
- **v2 path (documented, not built):** deterministic reruns — if games adopt seeded RNG + input logging (already a conventions preference), the platform can replay-validate top scores server-side, the Open Hexagon pattern.

## Moderation & safety

- Content judge rides the verify loop (blocks hate/sexual/IP-infringing games pre-publish).
- Leaderboard names pass a word filter at submit.
- Report button on every game page; reports above a threshold auto-unlist pending review.
- Games execute only on the sandboxed play origin, inside an iframe on game pages, `sandbox` attrs + CSP; no cookies/storage of the app origin are reachable.

## Observability

Per-generation traces (prompt → brief → cycles → verdicts → cost) are product-critical data: they are the tuning surface for judge prompts, cycle budgets, and cost. Log verdicts + evidence pointers; build the golden-set re-run harness on this same trace format.
