# GameSight — Production Plan

_Final. 2026-07-20. One developer. The full loop ships day 1, and it charges money day 1._

Option matrices and citations are in `research/`. This is the decision.

---

## The loop

**prompt → agents build it → play it → share it → friends play free → some sign up → they prompt.**

Playing is free forever — that's the viral surface. **Generating is the paid action.** New accounts get ~2 free games to feel the loop, then it costs credits. The revenue loop and the viral loop are the same loop.

---

## Five services, each irreducible

| | Does | Why it can't go |
|---|---|---|
| **Vercel** | Hosts the Next.js app | `git push` deploys, preview per branch, instant rollback. Pro ($20/mo) — Hobby forbids commercial use. |
| **Turso** | **The database** — hosted SQLite (libSQL) | Same engine the app already speaks, so the schema ports nearly verbatim. HTTP, so it never welds us to a host. |
| **Cloudflare R2** | Game bundles, on their own domain | Untrusted code from strangers ships daily → the separate origin is mandatory. **$0 egress** is what makes a viral day free. |
| **Modal** | Runs the generation pipeline | 10–25 min job with Chromium + filesystem can't run on Vercel (~13 min cap, no browser). `.spawn()` is also the queue, and a throwaway container keeps a shell-wielding agent off production. |
| **Polar** | Credits + subscriptions | Money day 1. Merchant-of-Record, so a solo dev never registers for VAT anywhere. Native credit primitives. |

**Better Auth** is a library, not a service — no account, no bill; its `user` table is just another Turso table. Google sign-in is free console config.

Five managed services, zero servers to patch.

---

## Data

**Turso:** games, scores, leaderboards, ratings, users, sessions, credits, generation jobs.
**R2:** game bundles (`index.html`, `cover.svg`) — immutable, CDN-served.

**No schema tooling.** `migrate()` is already idempotent and runs on first connection, so it self-migrates on deploy. `syncGamesFromDisk()` gets deleted — in production the DB is the source of truth for metadata, written by the push script (seed games) and the worker (generated ones).

---

## Money

**Free:** playing, sharing, remixing, leaderboards, ratings. Gating any of it would kill growth.
**Costs credits:** generating a game, and editing one (an edit re-runs the pipeline).

**Three ways in:** free starter credits on signup (the funnel — the loop must be felt to be bought) · a one-time credit pack (impulse, at the "one more" moment) · a subscription granting monthly credits plus perks that cost us nothing (priority queue, fuller verify budget, creator profile).

**Two rules that protect margin:**
1. **Debit at job start, refund on failure.** A rejected build still burns tokens; charging only on success makes every failure a pure loss.
2. **Cycle budget is the cost dial.** Cost ≈ (designer + builder + playtest + judges) × cycles. If measured cost is too high, cut in this order: cheaper playtest narration → cheaper judges → fewer cycles.

**The pricing rule, not the number: a credit sells for 3–4× measured token cost.** The number is blocked on the benchmark below.

---

## Why it survives virality

| Load | When it pops | Goes to | Marginal cost |
|---|---|---|---|
| Playing (bandwidth) | Enormous | R2 via CDN | **$0** — no egress fee |
| Feed + leaderboards | High | Cached Next routes (30–60s) | ~1 query per interval, not per visitor |
| Score writes | Modest | Turso, indexed | Cheap |
| Generation (tokens) | Self-limiting | Modal, behind credits | **Paid by the user** |

The expensive path is free, the metered path is cached, and the costly path is revenue. The paywall doubles as the rate limiter.

---

## Safety

1. **Untrusted game code can't touch the app.** Separate registrable domain (R2), `iframe sandbox` *without* `allow-same-origin`, strict CSP (`connect-src 'none'` — games make no network calls). _Built; needs the domain._
2. **The build agent can't touch production.** The risk is the builder/judge agents holding filesystem + shell access, not the game. Fresh Modal container per job.
3. **Generation can't become a surprise bill.** Sign-in + credits debited up front + per-account daily cap + **one running job per account**.
4. **Bad content has two gates.** Prompt moderation before tokens are spent; the judge's content check before anything publishes (the `published.json` gate), plus the built report-and-unlist path.
5. **Existing hardening carries over.** Session-gated scores, anti-cheat quarantine, body-size limits, play-time-gated reports, owner-only publish.

Secrets live only in Vercel and Modal env; none ever reaches a game bundle.

---

## Deploy

```
git push                  # → Vercel builds + deploys the app
modal deploy worker.py    # → the generation worker
npm run push-games        # → seed bundles to R2 + upsert their rows
```

The database needs no deploy step.

---

## Build order

One launch, so these are work items. Deployable to a private Vercel URL from step 3 — dogfood the real thing early.

1. **Token benchmark** — blocking; sets pricing and whether the cycle budget must shrink.
2. **Turso port** — `lib/db.ts` → `@libsql/client` (18 files, 12 `prepare()` calls; mechanical, the only tedious part).
3. **R2 + game origin** — bucket, domain, CSP, push script.
4. **Modal worker** — pipeline in a container; generation survives tab-close. The cooking tray already polls the right row, so **no UI change**.
5. **Better Auth + Google** — real ownership; adopt each browser's localStorage games into `user.id` on first sign-in.
6. **Polar + caps** — checkout, webhook, balance, debit/refund, daily cap, one-job-per-account.
7. **Smoke-test the full loop in production, money included.** Then open the doors.

**Deferred:** Apple sign-in ($99/yr + a secret that silently expires every 6 months), email/push pings (the tray covers it), party multiplayer.

---

## Cost, and the one blocking task

| Stage | Monthly |
|---|---|
| Launch | **$20** Vercel Pro + ~$1 domains; Turso, R2, Modal free-tier |
| Steady state | **$20–30** infra + tokens, offset early by **Anthropic Claude for Startups** credits (~$25k) |
| Viral (1M plays/day) | **~$50–200** — bandwidth stays $0; growth is Vercel invocations + Turso reads |

**Measure token cost per published game.** Run the existing pipeline ~10× across easy and hard prompts, logging tokens and cycles per stage; take the mean **and the p90** (the tail is what a 3-cycle game costs). That number sets the credit price, the free grant, and whether the judges need a cheaper model. Nothing architectural can answer it, and it's the only thing between this plan and a launch that makes money.

---

## Deliberately not built

No queue service (`.spawn()` + one `generations` row *is* the queue; QStash's 60s timeout can't even run the job) · no Redis (Next caching covers the read paths) · no migration tool · no container orchestration · no tax engine (Polar is MoR) · no email service.

**Consolidations tried and rejected:**
- **Vercel Blob instead of R2** — metered egress (~$300/mo at 1M plays/day vs $0), and it would put untrusted games on the app's own domain, destroying the main safety boundary.
- **Vercel Postgres instead of Turso** — turns a near-verbatim port into a real migration and re-welds the DB to the host.
- **Stripe instead of Polar** — ~2 points cheaper, but then a solo dev owns worldwide VAT registration and filing. Revisit when revenue justifies the ops.
- **Generation on Vercel** — impossible: ~13 min ceiling, no Chromium, and it would run a shell-wielding agent inside the app's runtime.

## Open

Domain names (app + game origin) · credit price, pack size, subscription tier, free grant — all blocked on the benchmark.
