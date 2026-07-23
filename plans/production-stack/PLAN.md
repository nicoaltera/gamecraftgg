# GameSight — Production Plan

_Final. Revised 2026-07-23 for launch 2026-07-24. One developer. Full loop day 1, revenue day 1._

Option matrices and citations are in `research/`. This is the decision.

**Founder decisions locked (2026-07-23):** single box + SQLite volume · Better Auth email+password · Opus 4.8 only (env-swappable to Opus 5) · 200 credits granted on signup · 100 credits per generation *or* edit · 10 credits = $1 · one-time credit packs, no subscription · payments live day 1.

---

## What changed from the previous revision, and why

The last revision assumed Vercel + Turso + Modal + R2 + Polar and made an ≤$1.20 unit-cost gate the launch blocker. Three of those premises are gone:

| Was | Now | Why |
|---|---|---|
| ≤$1.20/game gate blocks launch | **Dropped as a blocker** | The gate existed to protect margin on a subscription. Price is now $10/build against ~$5–8 cost — margin is priced in, not discovered. Spend appetite is ~$10k/day, so cost is not the constraint. |
| Vercel + Turso | **One Fly machine + SQLite on a volume** | Turso existed so a serverless app and a Modal worker could share a DB over HTTP. One box removes both needs, and deletes an 18-file / 12-`prepare()` port. |
| Modal build workers | **Pipeline as a scrubbed subprocess on the box** | Accepted trade: weaker agent isolation, in-flight builds die on redeploy. Bought back with a scrubbed env and a low concurrency ceiling. First post-launch migration. |
| R2 for game bundles | **Second domain → same box** | See Safety §1. R2 was never the security boundary — the *origin* is. Bandwidth at 60KB/game is pennies. R2 becomes a cost optimization for later, not a launch dependency. |

Net: **five services become two** (Fly + Polar; Better Auth is a library). Payments come back in, because there is now something to sell.

---

## The loop

**prompt → agents build it → play it → share it → friends play free → some sign up → they spend their 200 → they buy more.**

Playing, sharing, and **remixing** are free forever — remix is a file copy, so the entire viral surface costs ~$0. **Generating and editing are the paid actions**, because they are the only things that cost real money.

---

## Money

| | |
|---|---|
| Credit value | **10 credits = $1** (1 credit = $0.10) |
| Generation | **100 credits** ($10) |
| Edit (re-prompt an existing game) | **100 credits** ($10) — an edit re-runs the pipeline |
| Signup grant | **200 credits** (two free builds, $20 face value) |
| Model | Packs only, no subscription |

Proposed Polar products (adjust freely): **$10 → 100cr · $50 → 550cr · $100 → 1,200cr.** Slight bonus at the top so buying up has a reason.

**Free forever:** playing, sharing, remixing, leaderboards, ratings, challenge links.

**Two rules that protect margin:**
1. **Debit at job start, refund on failure.** A rejected build still burns tokens; charging only on success makes every failure a pure loss.
2. **Retry the builder once on a mid-stream API failure before consuming a cycle.** Observed in testing: a dropped connection kills a run. Under debit-at-start, every blip is otherwise a refund or an angry customer.

---

## Credits are a ledger, not a counter

With real money, `credits INTEGER` cannot answer "why does my balance say 140?" and cannot be reconciled against Polar. Append-only instead:

```sql
CREATE TABLE credit_entries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  delta      INTEGER NOT NULL,          -- +200 grant, +100 purchase, -100 debit, +100 refund
  reason     TEXT NOT NULL,             -- signup_grant | purchase | debit | refund
  ref_id     TEXT NOT NULL,             -- generation id, or Polar order id
  created_at INTEGER NOT NULL,
  UNIQUE(reason, ref_id)
);
CREATE INDEX credit_entries_user ON credit_entries(user_id);
```

Balance is `SELECT COALESCE(SUM(delta),0) FROM credit_entries WHERE user_id = ?`.

That `UNIQUE(reason, ref_id)` is the whole trick — it buys three properties with no application logic:

- **Webhook idempotency.** Polar retries deliveries; a duplicate `purchase` for the same order id hits the constraint and no-ops. Without it, a retry double-grants.
- **Refunds are compensating entries, not mutations** — debit-at-start / refund-on-failure keeps a full audit trail instead of silently rewinding a number.
- **No double-debit** on a retried or replayed generate request.

Debit and job-insert happen in **one SQLite transaction** with the existing atomic cap check. Single writer, real transactions — no distributed-consistency problem. This is the strongest argument for the one-box shape.

---

## Two services, each irreducible

| | Does | Why it can't go |
|---|---|---|
| **Fly.io** | One machine: Next.js app + SQLite on a persistent volume + the generation pipeline as a subprocess + game serving from the volume | A 10–25 min job with Chromium and a filesystem can't run serverless. One box collapses app, DB, worker, and game storage into a single deploy with real transactions. |
| **Polar** | Credit packs | Money day 1. Merchant-of-Record, so a solo dev never registers for VAT anywhere — ~2 points more than Stripe, and worth every one of them. |

**Better Auth** is a library, not a service — no account, no bill; its `user` table is just another SQLite table. Email+password, no OAuth console dependency, no email service.

Two managed services, zero servers to patch.

---

## Data

**SQLite on the Fly volume:** games, scores, leaderboards, ratings, plays, referral_edges, generations, users, sessions, credit_entries.
**The same volume:** game bundles (`index.html`, `cover.svg`, `meta.json`, `published.json`), served by the existing `/play/[slug]/[[...file]]` route.

`migrate()` is idempotent and runs on first connection, so it self-migrates on deploy. **`syncGamesFromDisk()` stays** — on a durable volume it is a feature, not a hazard. Audited: its `ON CONFLICT DO UPDATE` deliberately omits `creator_ref` and `status`, so ownership and draft state survive every restart. That matters more now that ownership gates money.

---

## Safety

### 1. Untrusted game code cannot reach the app — and login is what makes this urgent

Games are machine-generated code from stranger prompts, rendered in an iframe with `sandbox="allow-scripts allow-same-origin"` (`GameStage.tsx:290`). With `NEXT_PUBLIC_GAME_ORIGIN` unset it falls back to the app's own origin, where that sandbox combination provides **no isolation whatsoever**.

Until now the worst a hostile game could steal was a localStorage ref. **The moment real accounts ship, it's session cookies and a credit balance.** Adding auth is precisely what makes the existing hole worth exploiting.

**The security boundary is the origin, not the storage.** Same-origin policy keys on scheme+host+port, so serving games from `play.gamesight.xyz` isolates them from `gamesight.xyz` regardless of whether the bytes come from R2 or a local volume. Hence: second domain, same Fly app, no object storage needed.

Both env vars are required and they are a matched pair — the code already implements both halves:

| Var | Value | Used by |
|---|---|---|
| `NEXT_PUBLIC_GAME_ORIGIN` | `https://play.gamesight.xyz` | iframe `src` + `postMessage` origin validation (`GameStage.tsx:18,136,297`); `frame-src` in the app CSP (`next.config.ts:11`) |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://gamesight.xyz` | `frame-ancestors` on the game-serving route (`play/…/route.ts:29,38`) — **without this the iframe refuses to render cross-origin** |

Game responses already carry `connect-src 'none'` (`play/…/route.ts:37`) so a game makes no network calls at all, and cannot exfiltrate a stolen anything even if it gets one.

**Hardening to apply:** the global `X-Frame-Options: SAMEORIGIN` (`next.config.ts:35`) is served on `/:path*`, which includes `/play/*`. Per CSP Level 2, a present `frame-ancestors` supersedes XFO and current browsers implement that — so this is *probably* fine, but it is fragile and free to fix. Scope the header to exclude `/play/:path*` and verify cross-origin rendering explicitly in the smoke test.

### 2. The build agent cannot touch production

No Modal container on day 1, so this is bought with process discipline instead:

- Spawn `pipeline/run.mjs` with a **scrubbed env** — `ANTHROPIC_API_KEY` and the game dir only. No DB path, no session secret, no Polar token, no Fly API token. The parent process owns every DB write.
- Agent file access stays scoped to the game folder (already built).
- Accepted residual risk: prompt-injection-driven egress from the build subprocess. The concurrency ceiling bounds the blast radius. Modal closes it post-launch.

### 3. Free credits are now inventory, and inventory gets farmed

200 credits is **$20 of sellable product per account**. Unverified email+password means a script can mint accounts and harvest $20 each — and that gets found within hours of a viral post. This is a fraud vector, not a cost line.

Day 1: **per-IP signup limit** (a few per hour) + **per-IP generate limit** + **one running job per account**. Email verification is the real fix, needs an email service the stack deliberately lacks — scheduled, not shipped.

### 4. Money can't become a surprise

Sign-in required to generate · debit before the job starts · one running job per account · global daily generation cap retained purely as a **kill switch** (env var, flip to 0 without a deploy).

### 5. Existing hardening carries over

Session-gated scores, anti-cheat quarantine, body-size limits, play-time-gated reports, owner-only publish, moderation before tokens are spent, judge content gate before publish, report-and-unlist.

Secrets live only in Fly secrets; none reaches a game bundle or the build subprocess.

---

## Throughput is the constraint, not spend

At ~$10k/day appetite, money stops being the limiter and the machine becomes one. A build is 10–25 min and spawns `claude` CLI processes plus a Chromium via Playwright.

| | |
|---|---|
| Realistic concurrency on one box | **4–8 builds** |
| Daily capacity | **~400–700 builds** |
| Revenue ceiling | **~$4–7k/day** |
| Generation spend at capacity | ~$2.5–4k/day |

You would have to try to reach $10k/day on one machine. Consequences:

- **The cap is not what users feel — the queue is.** One job per account, visible position, and the existing cooking tray already polls the right row.
- **Scaling past one box requires the Turso port**, because SQLite on a volume pins you to one writer. Turso + Modal is therefore not cancelled but *scheduled* — and it is the change that raises the revenue ceiling, so it pays for itself.

---

## Launch-day build order

Small and independent first, so a bad day still lands the model swap, cost visibility, and the security boundary.

| # | Task | Est. |
|---|---|---|
| 1 | `GS_MODEL_{DESIGNER,BUILDER,JUDGE}=claude-opus-4-8` (env only — Opus 5 is the same one-liner, no code edit) | 2 min |
| 2 | Persist `_cost` → `generations.cost` on both success and error paths | 15 min |
| 3 | Fix the verify-server port collision (see Findings) | 15 min |
| 4 | Scope `X-Frame-Options` off `/play/:path*` | 10 min |
| 5 | `users` + `sessions`; Better Auth email+password | 2–3 hr |
| 6 | `credit_entries` ledger + balance helper + 200cr `signup_grant` | 1 hr |
| 7 | Gate `/api/generate` (**create *and* edit**) on session; 100cr debit + job insert in one transaction; refund on failure | 1.5 hr |
| 8 | Polar products + hosted checkout link (`user_id` in `metadata`) + `order.paid` webhook → `purchase` entry | 1.5–2 hr |
| 9 | Balance in header, out-of-credits state, buy-credits link, post-checkout balance poll | 1 hr |
| 10 | Adopt each browser's localStorage games into `user.id` on first sign-in | 1 hr |
| 11 | Second domain + both origin env vars + cross-origin iframe verification | 1 hr |
| 12 | Per-IP signup/generate limits + one-job-per-account | 30 min |
| 13 | Fly deploy: Dockerfile (Chromium + `claude` CLI), volume, secrets, scrubbed subprocess env | 2 hr |
| 14 | Smoke-test the full loop **including a real card charge** | 1 hr |

**~14–16 hours.** Honestly: that is two working days, or one very long one. If it must compress, cut #9 to a bare balance number plus a link and defer #10 (people re-create rather than adopting anonymous drafts). Everything else is load-bearing or the safety boundary.

### Definition of done

Signup → 200cr → generate (−100) → publish → share link → anonymous friend plays and beats the score → generate again (−100) → balance 0 blocks cleanly with a buy link → buy the $10 pack with a real card → webhook grants 100cr → generate succeeds → force a build failure → 100cr refunded and visible in the ledger.

---

## Findings from the 2026-07-23 code audit

Four things the previous revision asserted or assumed that the code does not support.

| Finding | Severity | Status |
|---|---|---|
| **`generations.cost` is never written.** `pipeline/run.mjs:407` `console.log`s a `COST` line; nothing persists it, and the worker is spawned detached with `stdio: 'ignore'` so that number goes nowhere. All 5 rows read `0.00`. The previous plan's "instrumentation is already in place" was wrong, and its cost gate was therefore unmeasurable. | **Blocker for cost visibility** | Build item 2 |
| **Verify-server port collision.** `pipeline/run.mjs:314` picks `9100 + random(400)`. At 8 concurrent builds that's a ~7% chance some pair collides per round — a bind failure fails the verify, burns a cycle, and now costs a refund. Random port choice was fine when builds were serial; concurrency is now the operating mode. Use an OS-assigned port (`listen(0)`) instead. | **High under concurrency** | Build item 3 |
| **Global `X-Frame-Options: SAMEORIGIN` also lands on `/play/*`.** CSP `frame-ancestors` should supersede it in current browsers, so likely benign — but it is the one header that would silently stop every game from rendering once the second origin goes live. | Medium (fragile) | Build item 4 |
| **`syncGamesFromDisk` does not clobber ownership.** Audited because it now guards money: the `ON CONFLICT DO UPDATE` at `lib/db.ts:181` omits `creator_ref` and `status`. Safe to keep on a durable volume. | None — verified good | No action |

---

## Deploy

```
fly deploy                # app + pipeline + migrations (migrate() runs on first connection)
fly secrets set ...       # ANTHROPIC_API_KEY, POLAR_*, BETTER_AUTH_SECRET, origins
```

The database needs no deploy step. Game bundles need no push step — they are on the volume.

---

## Cost

| Stage | Monthly |
|---|---|
| Launch | **~$10–25** Fly machine + volume, ~$2 domains; Polar takes a revenue cut, no fixed fee |
| Steady state | Infra is noise; **tokens are the cost line**, offset early by Anthropic Claude for Startups credits (~$25k) |
| Viral | Bounded by the throughput ceiling above, not by the budget |

Startup credits are runway, not a business model — but with revenue live on day 1, the race is now against churn, not against the credit balance.

---

## Deliberately not built

No queue service (`.spawn()` + one `generations` row *is* the queue) · no Redis (Next caching covers the read paths) · no migration tool · no container orchestration · no tax engine (Polar is MoR) · no email service · no object storage.

**Consolidations tried and rejected:**
- **Stripe instead of Polar** — ~2 points cheaper, but then a solo dev owns worldwide VAT registration and filing.
- **Vercel + Turso + Modal for launch** — best isolation, but the Turso port plus a Modal worker plus auth plus payments does not land in a day. Deferred deliberately, not dismissed.
- **R2 on day 1** — solves a problem the one-box shape doesn't have. The origin is the boundary; the volume is the storage.
- **Google OAuth** — better signup conversion, but a Google Cloud console client and domain verification is an external dependency that can eat launch day. Post-launch.

## Scheduled debt (post-launch, in order)

1. **Modal build workers** — closes the agent-isolation gap and survives redeploys.
2. **Turso port** — required to run more than one box; raises the revenue ceiling.
3. **Email verification** (Resend) — closes the free-credit farming vector.
4. **Google OAuth** — signup conversion.
5. **R2 + CDN** — when egress or latency actually justifies it.
6. **Unit-cost work** — the seven levers from the previous revision still apply, and each one is now margin rather than survival.

## Open

Domain names · final pack sizes · whether an edit should ever cost less than a fresh generation (currently both 100cr, per founder decision).
