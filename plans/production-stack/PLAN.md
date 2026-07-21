# GameSight — Production Plan

_Final. 2026-07-20. One developer. Full loop day 1, revenue day 1._

Option matrices and citations are in `research/`. This is the decision.

---

## The headline: the stack is right, the unit cost is not

Generation currently costs **~$10 per game**. At a 3–4× markup that's a $30–40 price tag on a browser game, and a single free game per signup is $10 of customer-acquisition cost — which a viral spike turns into five figures overnight.

**No pricing model works at $10.** So the first work item isn't infrastructure, it's getting cost per game down to **≤ $1.20**, which is roughly an 8× reduction. Everything below assumes that gate is met before paid generation opens.

The good news: **this doesn't touch the stack.** It's a pipeline-economics problem, and the levers are known and mostly mechanical.

---

## The loop

**prompt → agents build it → play it → share it → friends play free → some sign up → they prompt.**

Playing, sharing, and **remixing** are free forever — remix is a file copy, so the entire viral surface costs ~$0. **Generating is the paid action**, because it's the only thing that costs real money.

---

## Five services, each irreducible

| | Does | Why it can't go |
|---|---|---|
| **Vercel** | Hosts the Next.js app | `git push` deploys, preview per branch, instant rollback. Pro ($20/mo) — Hobby forbids commercial use. |
| **Turso** | **The database** — hosted SQLite (libSQL) | Same engine the app already speaks, so the schema ports nearly verbatim. HTTP, so it never welds us to a host. |
| **Cloudflare R2** | Game bundles, on their own domain | Untrusted code from strangers ships daily → separate origin is mandatory. **$0 egress** makes a viral day free. |
| **Modal** | Runs the generation pipeline | A 10–25 min job with Chromium + filesystem can't run on Vercel (~13 min cap, no browser). `.spawn()` is also the queue, and a throwaway container keeps a shell-wielding agent off production. |
| **Polar** | Credits + subscriptions | Money day 1. Merchant-of-Record, so a solo dev never registers for VAT anywhere. |

**Better Auth** is a library, not a service — no account, no bill; its `user` table is just another Turso table.

Five managed services, zero servers to patch.

---

## Data

**Turso:** games, scores, leaderboards, ratings, users, sessions, credits, generation jobs.
**R2:** game bundles (`index.html`, `cover.svg`) — immutable, CDN-served.

**No schema tooling.** `migrate()` is idempotent and runs on first connection, so it self-migrates on deploy. `syncGamesFromDisk()` gets deleted — in production the DB is the source of truth for metadata, written by the push script (seed games) and the worker (generated ones).

---

## Getting cost per game from $10 to ≤$1.20

Measured breakdown of one real end-to-end run ($8.27, 3 cycles): **builder $5.26**, **judge $2.56** (3 calls), **designer $0.44**. The builder dominates, and cycles multiply everything.

Levers, in order of leverage:

1. **Pin a mid-tier model per role.** The measured run inherited whatever the CLI defaulted to. A Sonnet-class model is several times cheaper per output token than an Opus-class one, and the builder is almost entirely output. _Shipped: models are now pinned and env-overridable._
2. **Fail fast on free signals.** The Playwright harness already catches console errors for **$0**. When it fails, go straight back to the builder — never pay a judge call to report what a free check already knows.
3. **Edit instead of rewrite on fix cycles.** _Shipped._ Cycles 2–3 now patch in place instead of re-emitting 60KB.
4. **Target smaller games (~30KB, not 65KB).** Builder cost is mostly output tokens, so this roughly halves it — and the library's best games aren't its biggest ones, so this likely *improves* quality.
5. **Cap the cycle budget at 2.** A third cycle rarely rescues a bad build and costs a full builder + judge round.
6. **One strong taste judge**, not a panel; mechanical checks belong in the harness, which is free.
7. **Stop re-creating the prompt cache.** Every `claude -p` spawn re-writes ~21k tokens of system prompt (~$0.13), and `CONVENTIONS.md` is re-sent to every builder call. Running the build→fix loop in one session turns those cache *writes* into cache *reads* at a fraction of the cost.

**Hard gate: don't open paid generation until a 5-run benchmark measures ≤$1.20/game.** The instrumentation to prove it is already in place (`generations.cost`, per-phase, plus a `COST` summary line per run).

---

## Money (contingent on the gate)

**Free:** playing, sharing, remixing, leaderboards, ratings — plus **one free generation** on signup. At ≤$1.20 that's a defensible CAC; at $10 it is not.
**Costs credits:** generating a game, and editing one (an edit re-runs the pipeline).

**Pricing rule, not numbers: allowance × cost ≤ 50% of price**, so margin survives a fully-utilizing subscriber. At $1.20/game that gives roughly: **$5 for 3 games** (impulse pack) and **$12/mo for 5 games + perks** that cost nothing to grant (priority queue, fuller verify budget, creator profile). If cost lands at $0.60, double the allowances rather than cut the price.

**Two rules that protect margin:**
1. **Debit at job start, refund on failure.** A rejected build still burns tokens, so charging only on success makes every failure a pure loss.
2. **Retry the builder once on a mid-stream API failure before consuming a cycle.** Observed in testing: a dropped connection kills a run. Under debit-at-start, every blip is otherwise a refund or an angry customer.

---

## Why it survives virality

| Load | When it pops | Goes to | Marginal cost |
|---|---|---|---|
| Playing (bandwidth) | Enormous | R2 via CDN | **$0** — no egress fee |
| Feed + leaderboards | High | Cached Next routes (30–60s) | ~1 query per interval, not per visitor |
| Score writes | Modest | Turso, indexed | Cheap |
| Generation (tokens) | Self-limiting | Modal, behind credits | **Paid by the user** |

The expensive path is free, the metered path is cached, and the costly path is revenue. The paywall doubles as the rate limiter — which is exactly why generation must never be free at scale.

---

## Safety

1. **Untrusted game code can't touch the app.** Separate registrable domain (R2), `iframe sandbox` *without* `allow-same-origin`, strict CSP (`connect-src 'none'`). _Built; needs the domain._
2. **The build agent can't touch production.** The risk is the builder/judge agents holding filesystem + shell access, not the game. Fresh Modal container per job.
3. **Generation can't become a surprise bill.** Sign-in + credits debited up front + per-account daily cap + **one running job per account**.
4. **Bad content has two gates.** Prompt moderation before tokens are spent; the judge's content check before anything publishes (the `published.json` gate), plus the built report-and-unlist path.
5. **Existing hardening carries over.** Session-gated scores, anti-cheat quarantine, body-size limits, play-time-gated reports, owner-only publish.

Secrets live only in Vercel and Modal env; none reaches a game bundle.

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

1. **Cut cost per game to ≤$1.20** and prove it with a 5-run benchmark. Blocks paid launch; nothing else matters if this fails.
2. **A pipeline end-to-end test.** Non-negotiable now: the cost benchmark uncovered two blockers that had made generation impossible end-to-end (see below). One scripted run against a fixed prompt would have caught both.
3. **Turso port** — `lib/db.ts` → `@libsql/client` (18 files, 12 `prepare()` calls; mechanical, the only tedious part).
4. **R2 + game origin** — bucket, domain, CSP, push script.
5. **Modal worker** — pipeline in a container; generation survives tab-close. The cooking tray already polls the right row, so **no UI change**.
6. **Better Auth + Google** — real ownership; adopt each browser's localStorage games into `user.id` on first sign-in.
7. **Polar + caps** — checkout, webhook, balance, debit/refund, daily cap, one-job-per-account.
8. **Smoke-test the full loop in production, money included.** Then open the doors.

**Deferred:** Apple sign-in ($99/yr + a secret that silently expires every 6 months), email/push pings (the tray covers it), party multiplayer.

---

## What the benchmark found (why step 2 exists)

Running the cost benchmark was worth more as a bug hunt than as a measurement:

| Finding | Severity | Status |
|---|---|---|
| `games` INSERT had 14 placeholders, 13 values — `author` never passed, so every judge-passing game crashed at publish | **Blocker** | Fixed |
| Builder had no write permission and was expected to emit a 40–70KB game in one message, exceeding the output limit | **Blocker** | Fixed — writes to disk |
| No model pinned, so unit cost rode on a CLI default | Cost risk | Fixed — pinned per role |
| No retry on mid-stream API failure | Revenue risk | Planned (money rule 2) |
| ~$0.13 fixed cost per agent spawn (system-prompt cache creation) | Cost floor | Lever 7 |

Generation had never completed end-to-end before these fixes. It now does.

---

## Cost

| Stage | Monthly |
|---|---|
| Launch | **$20** Vercel Pro + ~$1 domains; Turso, R2, Modal free-tier |
| Steady state | **$20–30** infra + tokens, offset early by **Anthropic Claude for Startups** credits (~$25k) |
| Viral (1M plays/day) | **~$50–200** — bandwidth stays $0; growth is Vercel invocations + Turso reads |

Startup credits are what buy time to hit the $1.20 gate. **They are runway, not a business model** — the cost work has to happen before they run out.

---

## Deliberately not built

No queue service (`.spawn()` + one `generations` row *is* the queue) · no Redis (Next caching covers the read paths) · no migration tool · no container orchestration · no tax engine (Polar is MoR) · no email service.

**Consolidations tried and rejected:**
- **Vercel Blob instead of R2** — metered egress (~$300/mo at 1M plays/day vs $0), and it would put untrusted games on the app's own domain, destroying the main safety boundary.
- **Vercel Postgres instead of Turso** — turns a near-verbatim port into a real migration and re-welds the DB to the host.
- **Stripe instead of Polar** — ~2 points cheaper, but then a solo dev owns worldwide VAT registration and filing.
- **Generation on Vercel** — impossible: ~13 min ceiling, no Chromium, and it would run a shell-wielding agent inside the app's runtime.

## Open

Domain names · final credit price and allowances, which follow from the measured cost once the gate is met.
