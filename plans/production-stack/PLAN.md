# GameSight — Production Plan

_Final. 2026-07-20. One developer. Cheap, safe, survives virality, deploys in three commands._

Option matrices and citations live in `research/`. This document is the decision.

---

## The stack

| Layer | Choice | Why this one |
|---|---|---|
| **App** | **Vercel** (Next.js 16, native) | Best Next deploy there is: `git push`, preview per branch, instant rollback. Iteration speed is the scarcest resource for a solo dev. Pro ($20/mo) — Hobby forbids commercial use. |
| **State** | **Turso** (libSQL) | Same SQLite dialect as today, so the schema ports nearly verbatim. Host-agnostic HTTP, so it never welds us to a host. |
| **Games + game origin** | **Cloudflare R2** on its own domain | One choice solves four problems: object storage for generated bundles, a genuinely separate origin, **$0 egress**, and CDN-scale serving. |
| **Generation** | **Modal** | `.spawn()` is a durable job queue *and* a container runtime in one. A throwaway container per job also contains the tool-using build agent. $30/mo free credits. |
| **Identity** | **Better Auth** + Google | Library, not a vendor bill. `user.id` lives in our DB, so billing attaches with a plain foreign key. |
| **Money** | **Polar** | Native prepaid-credits + subscription, and Merchant-of-Record — it remits worldwide VAT so a solo dev never registers for tax. |
| **Ping** | **Resend** | "Your game is ready." One API call from the worker. |

Six pieces. Each does exactly one job, and none can be removed without losing a required property.

---

## Why this survives virality

The insight: **the three kinds of load have wildly different costs, so route each to the cheapest thing that can serve it.**

| Load | Volume under virality | Where it goes | Marginal cost |
|---|---|---|---|
| Playing games (bandwidth) | Enormous | R2 static bundles via CDN | **$0** (R2 has no egress fee) |
| Feed + leaderboards (reads) | High | Cached Next routes (revalidate 30–60s) | ~1 query per interval, not per visitor |
| Score writes | Modest | Turso | Cheap, indexed |
| Generation (LLM tokens) | Self-limiting | Modal, gated by credits | Paid for by the user |

The expensive path is free, the metered path is cached, and the genuinely costly path is behind a paywall. A viral spike is a bandwidth event, and bandwidth is the one thing we've made free. Nothing about a 100× traffic day requires a human to intervene.

---

## Safety model

Four boundaries, in order of importance:

1. **Untrusted game code can't touch the app.** Games are machine-generated JS running in every player's browser. They're served from a **distinct registrable domain** (R2), embedded with `iframe sandbox` *without* `allow-same-origin`, under a strict CSP (`connect-src 'none'` — a game makes no network calls at all). Cross-origin is the boundary; the CSP is defence in depth. _Already built; needs the second domain._
2. **The build agent can't touch production.** The real risk isn't the game, it's the builder/judge agents holding filesystem and shell access. They run in a **fresh Modal container per job**, never on the box serving traffic. Blast radius is one disposable container.
3. **Generation can't be abused into a bill.** Sign-in required, credits debited before the job starts, hard per-account daily cap. Cost is bounded by design, not by monitoring.
4. **Existing hardening stays.** Session-gated score submission, anti-cheat quarantine, size-bounded request bodies, play-time-gated reporting, owner-only publish. _Already built._

Secrets live in Vercel and Modal env only. No key ever reaches a game bundle.

---

## Deploying it

```
git push                    # → Vercel builds + deploys the app (preview per branch)
modal deploy worker.py      # → the generation worker
npm run push-games          # → sync game bundles to R2
```

Three idempotent commands, no CI to babysit, no containers to orchestrate, no servers to patch.

---

## Rollout

Each phase is independently shippable and useful on its own.

**Phase 0 — Public and playable.** Port `lib/db.ts` to `@libsql/client` (18 files, 12 `prepare()` calls — mechanical, the only real friction in this plan). Push the 16 seed games to R2 behind its own domain with the CSP. Deploy to Vercel. **Ship with creation turned off** — launch as a games site. This is deliberate: it removes auth, billing, and hosted generation from the critical path, so nothing gates going live.

**Phase 1 — Accounts.** Better Auth + Google. On first sign-in, adopt the browser's existing localStorage games into the new `user.id` in one transaction.

**Phase 2 — Hosted generation.** Modal image (`run.mjs` + `claude` CLI + Playwright/Chromium, volume for the workdir). The generate route `.spawn()`s and returns immediately; the worker uploads to R2, writes the terminal state, and emails the ping. The cooking tray and `/build/[id]` already poll that row, so **the UI needs no change** to support leaving.

**Phase 3 — Credits.** Polar: a subscription granting N credits per cycle, a `game_generated` meter, free starter credits for new accounts. Gate generation on `balance > 0`. Turn creation on.

**Deferred on purpose:** Apple sign-in (needs $99/yr + a secret that silently expires every 6 months), web push (email is enough), party/multiplayer rooms.

---

## Cost

| Stage | Monthly |
|---|---|
| Launch (Phase 0) | **$20** Vercel Pro + ~$1 domain. Turso, R2, Modal, Polar all free-tier. |
| Creation live | **$20–30** + Claude tokens, initially covered by **Anthropic Claude for Startups** credits (~$25k). |
| Viral (1M plays/day) | **~$50–200.** Bandwidth stays $0; the growth is Vercel invocations and Turso reads. |

**The one number that decides the business:** measured Claude-token cost per published game (design → build → play-test → judge, up to 3 cycles). Benchmark it before pricing a credit. It's independent of every choice above, and it's the real go/no-go.

---

## What we deliberately did not build

Elegance here is mostly subtraction:

- **No queue service.** Modal's `.spawn()` + one `generations` row is the queue. (Inngest/Trigger.dev are redundant; QStash's 60s timeout can't even run the job.)
- **No Redis/cache layer.** Next's built-in caching covers the read-heavy paths.
- **No container orchestration.** Vercel and Modal each own their own runtime.
- **No tax engine.** Polar is Merchant-of-Record.
- **No self-hosted anything.** A solo dev should patch zero servers.
- **No Cloudflare Workers for the app.** Considered and rejected: OpenNext is an adapter layer with a 3 MiB bundle ceiling, and its win was free bandwidth we get from R2 anyway — without giving up Vercel's preview deploys.

## Open decisions

- Domain names (app + game origin).
- Credits per game, and how many free credits a new account gets — both blocked on the token benchmark.
