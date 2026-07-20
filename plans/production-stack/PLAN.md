# GameSight — Production Plan

_Final. 2026-07-20. One developer. Cheap, safe, survives virality, deploys in two commands._

Option matrices and citations live in `research/`. This document is the decision.

---

## Launch needs three services

| | What it is | Why |
|---|---|---|
| **Vercel** | Hosts the Next.js app | `git push` deploys. Preview per branch, instant rollback. Pro ($20/mo) — Hobby forbids commercial use. |
| **Turso** | **The database.** Hosted SQLite (libSQL) | It is the same engine the app already uses, so today's schema ports nearly verbatim. Host-agnostic HTTP — never welds us to Vercel. |
| **Cloudflare R2** | Bucket holding the game bundles, on its own domain | One choice solves four problems: storage for generated games, a separate origin (the safety boundary), CDN serving, and **$0 egress**. |

That's the whole launch stack. One domain each for the app and the games.

**Two more arrive later, only when the feature that needs them ships:**

- **Modal** (Phase 2) — runs the generation pipeline. A 15–25 minute job with Chromium and a filesystem can't run on Vercel; this is the one thing that genuinely needs its own runtime.
- **Polar** (Phase 3) — credits and subscriptions. Merchant-of-Record, so a solo dev never registers for VAT anywhere.

**Not services:** **Better Auth** is a library inside the app (no account, no bill — the `user` table lives in Turso). Google sign-in is free console config. Email pings are optional and deferred — the cooking tray already notifies in-browser.

**Peak: five services, arriving one at a time.** Nothing on this list can be removed without losing a required property — I tried, and the two near-misses are documented at the bottom.

---

## Where the data lives

| Data | Home | Notes |
|---|---|---|
| Games, scores, leaderboards, ratings, users, credits, generation jobs | **Turso** | One SQLite database. Same tables as today plus `user` and a credits/balance table. |
| Game bundles (`index.html`, `cover.svg`) | **R2** | Immutable static files, served by CDN from the game origin. |
| Sessions | **Turso** (via Better Auth) | |

**Schema management: none needed.** `migrate()` is already idempotent — `CREATE TABLE IF NOT EXISTS` plus additive `ALTER`s, run automatically on first connection. It self-migrates on deploy. No migration tool, no extra command.

One real change in production: `syncGamesFromDisk()` gets deleted. It's a local-dev convenience that reads the `games/` folder; in production the database is the source of truth for game metadata, written by the push script (seed games) and the worker (generated games).

---

## Why this survives virality

The three kinds of load cost wildly different amounts, so each goes to the cheapest thing that can serve it:

| Load | Volume when it pops | Where it goes | Marginal cost |
|---|---|---|---|
| Playing games (bandwidth) | Enormous | R2 static bundles via CDN | **$0** — R2 charges no egress |
| Feed + leaderboards (reads) | High | Cached Next routes (revalidate 30–60s) | ~1 query per interval, not per visitor |
| Score writes | Modest | Turso, indexed | Cheap |
| Generation (LLM tokens) | Self-limiting | Modal, behind credits | Paid by the user |

The expensive path is free, the metered path is cached, and the genuinely costly path is paywalled. A viral day is a bandwidth event, and bandwidth is the thing we made cost nothing. No human has to intervene.

---

## Safety

Four boundaries, most important first:

1. **Untrusted game code can't touch the app.** Games are machine-generated JS running in every player's browser. Served from a **separate registrable domain** (R2), embedded with `iframe sandbox` *without* `allow-same-origin`, under a strict CSP (`connect-src 'none'` — a game makes no network calls at all). Cross-origin is the boundary; CSP is defence in depth. _Built; needs the domain._
2. **The build agent can't touch production.** The risk isn't the game, it's the builder and judge agents holding filesystem and shell access. They run in a **fresh Modal container per job**, never on the machine serving traffic.
3. **Generation can't become a surprise bill.** Sign-in required, credits debited before the job starts, hard per-account daily cap. Bounded by design, not by monitoring.
4. **Existing hardening carries over.** Session-gated scores, anti-cheat quarantine, body-size limits, play-time-gated reports, owner-only publish. _Built._

Secrets live only in Vercel and Modal env. No key ever reaches a game bundle.

---

## Deploying

```
git push               # → Vercel builds + deploys the app
npm run push-games     # → upload bundles to R2 + upsert their rows in Turso
```

Plus `modal deploy worker.py` once Phase 2 lands. The database needs no deploy step — it self-migrates.

---

## Rollout

**Phase 0 — Public and playable.** Port `lib/db.ts` to `@libsql/client`. Push the 16 games to R2 behind their own domain with the CSP. Deploy to Vercel. **Ship with creation turned off** — launch as a games site. This is the key simplification: it takes auth, billing, and hosted generation off the critical path, so nothing gates going live.

**Phase 1 — Accounts.** Better Auth + Google. On first sign-in, adopt the browser's existing localStorage games into the new `user.id` in one transaction.

**Phase 2 — Hosted generation.** Modal image (`run.mjs` + `claude` CLI + Playwright/Chromium). The generate route `.spawn()`s and returns immediately; the worker uploads to R2 and writes the terminal state. The cooking tray and `/build/[id]` already poll that row, so **the UI needs no change** to support leaving.

**Phase 3 — Credits.** Polar: a subscription granting N credits per cycle, a `game_generated` meter, free starter credits. Gate generation on `balance > 0`. Turn creation on.

**Deferred deliberately:** Apple sign-in ($99/yr plus a secret that silently expires every 6 months), email/web push, party multiplayer.

---

## Cost

| Stage | Monthly |
|---|---|
| Launch | **$20** Vercel Pro + ~$1 domains. Turso and R2 free-tier. |
| Creation live | **$20–30** + Claude tokens, initially covered by **Anthropic Claude for Startups** credits (~$25k). |
| Viral (1M plays/day) | **~$50–200.** Bandwidth stays $0; growth is Vercel invocations and Turso reads. |

**The number that decides the business:** measured Claude-token cost per published game (design → build → play-test → judge, up to 3 cycles). Benchmark it before pricing a credit. No architecture choice answers this.

---

## What we deliberately did not build

Elegance here is mostly subtraction.

- **No queue service.** Modal's `.spawn()` plus one `generations` row *is* the queue. Inngest/Trigger.dev are redundant; QStash's 60-second timeout can't even run the job.
- **No Redis or cache layer.** Next's built-in caching covers the read-heavy paths.
- **No migration tool.** The schema self-migrates.
- **No container orchestration, no servers to patch.** Vercel and Modal each own their runtime.
- **No tax engine.** Polar is Merchant-of-Record.
- **No separate email service at launch.** The in-app tray covers "your game is ready."

**The two consolidations I tried and rejected:**

- **Vercel Blob instead of R2** (would drop a vendor): Blob egress is metered. At a million plays a day that's roughly $300/mo instead of $0, and it would put untrusted games on the app's own domain — losing the primary safety boundary. R2 earns its place on both counts.
- **Vercel Postgres instead of Turso** (would drop a vendor): it's Postgres, turning a near-verbatim schema port into a real migration, and it re-welds the database to the host. Turso is the same SQLite engine the app already speaks.

## Open decisions

- Domain names (app + game origin).
- Credits per game, and free credits per new account — both blocked on the token benchmark.
