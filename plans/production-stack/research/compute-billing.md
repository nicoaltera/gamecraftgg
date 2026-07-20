# Research — Generation worker, job queue/notify, and billing (2026-07)

## TL;DR
- **Run the worker on Modal** — the only option that is a long-running container (browser + real FS) *and* a
  durable async job queue in one, with **$30/mo free credits, no card**. Per-15-min job compute ≈ $0.03–0.05 (noise vs Claude tokens).
- **Queue = Modal `.spawn()` + one `generations` DB row** as source of truth. Survives tab-close. No separate queue product.
- **Bill with Polar** (Merchant of Record) — native prepaid-credits + subscription, remits worldwide VAT/tax, free to start.
  **Stripe is the runner-up** (~2 pts cheaper) if you'll own tax compliance.
- **Fund early generation with Anthropic Claude for Startups** (up to ~$25k credits) + $5 new-account trial.

## 1. Worker host

| Host | Long job (15–25 min)? | Browser + real FS? | Free / card? | Enqueue + completion | ~Compute / 15-min job |
|---|---|---|---|---|---|
| **Modal** | Yes (up to 24 h) | Yes (custom image; Volumes) | **$30/mo free, auto-renewing, no card** | **Built-in** `.spawn()` → `FunctionCall` id; result retained 7 days | ~$0.03–0.05 |
| **Fly.io Machines** | Yes | Yes (Docker + volumes) | ~$5 trial then **card required** | Build it yourself (Machine per job + DB/webhook) | ~$0.02–0.05 |
| **Railway** | Yes | Yes | $5 trial then $1/mo min, card | Build it yourself | ~$0.028 |
| **Render** | Yes (workers first-class) | Yes | **No free worker** ($7/mo) | Build it yourself | flat $7+/mo |
| **Cloudflare Containers** | **Risky — no guaranteed runtime** | Yes | Workers Paid $5/mo | Worker + DO | low, but disqualified |
| **Plain VPS / Fargate** | Yes | Yes | card required | build everything | ~$5–10/mo / ~$0.02–0.04 |

**Read:** Modal is the only choice that's free-to-start with no card, purpose-built for "spawn a long job, fetch the result later", and fine with a bundled Chromium/Playwright. Fly/Railway are credible raw-container runners-up but need a card + hand-rolled queue. Cloudflare Containers' no-guaranteed-runtime disqualifies it for a paid 15–25 min job.

## 2. Queue / notify

| Option | Survives tab-close? | Runs the browser job itself? | Complexity | Fit |
|---|---|---|---|---|
| **Modal `.spawn()` + DB row** | Yes | Yes (it *is* the worker) | **Lowest** | **Best** |
| DB-as-queue (pgmq / status table) | Yes | No (still needs a worker) | Low | Good complement |
| Trigger.dev v3 | Yes | Yes (their runtime) | Medium | Viable alternative to Modal |
| Inngest | Yes | via their compute | Medium | Overkill for one linear job |
| QStash | delivery only | **No (60 s cap)** | Low | **Can't run the job — skip** |

**Read:** Don't stack a queue product on Modal — `.spawn()` already gives durable async execution + a job handle + 7-day result retention. Store one `generations` row (`queued→running→done/failed`, + modal_call_id + result URL); the UI polls that row; the worker writes terminal state + fires the ping.

## 3. Billing (credits + subscription)

| Provider | MoR (handles tax)? | Prepaid-credits + subscription | Fees | Free to start |
|---|---|---|---|---|
| **Polar** | **Yes** | **Native** (credits pre-pay usage; subs grant credits/cycle; meters bill overage) | 5% + 50¢ (drops to 3.4% at scale) | **Yes, no monthly fee** |
| Lemon Squeezy | Yes | subs + one-time; credits manual | 5% + 50¢ | Yes |
| Paddle | Yes | subs + usage; credits manual | ~5% + 50¢ | Yes |
| **Stripe** | Optional (Managed Payment add-on) | **First-class** meters + credits | 2.9% + 30¢ (+ tax you own) | Yes |
| Clerk Billing / Supabase | No (on Stripe) | bundled if already all-in | their fee on top | depends |

**Read:** For a solo/small team selling worldwide, **Merchant-of-Record tax handling is the deciding factor**, not the headline %. Polar/Lemon Squeezy remit VAT/US sales tax for you; Polar wins on native prepaid-credit primitives + rate discounts. Stripe is ~2 pts cheaper with excellent credits/meters but leaves you owning worldwide tax registration/filing. **Credits-per-generation** is modeled as: each success emits a `game_generated` usage event → a meter counts it → balance burns down; a subscription re-grants N/cycle; at 0 the customer is charged overage or blocked.

## 4. Anthropic funding (verify live before relying)
- New API account: ~**$5** trial credits.
- **Claude for Startups** (`claude.com/programs/startups`): up to **~$25k** credits (some tiers cite more), quick application, early-stage eligibility.
- Anthology Fund: +$25k for a narrower set. Claude for Open Source: 6 mo Max (a subscription, less relevant to a server pipeline).
- **Cost mapping:** compute is noise; the real per-game cost is **Claude tokens across design→build→play-test→judge × up to 3 verify cycles**, which swings with model choice and cycle count. **Benchmark empirically** (log tokens per job) before setting "credits per game"; give new users enough free credits for ~1–3 games.

## Recommended minimal design
1. Generation on **Modal** (image = `run.mjs` + `claude` CLI + Playwright/Chromium; Volume for the working dir; ~30-min timeout; Anthropic key = Modal secret funded by startup credits).
2. Next route `.spawn()`s the function, writes the `generations` row, reserves/decrements credits, returns immediately (tab can close).
3. On finish the worker uploads the bundle + updates the row (or POSTs a webhook), then sends the ping (email/web-push).
4. **Polar** grants credits/cycle, meters `game_generated`, gives free starter credits; gate generation on `balance > 0`.

## Gotchas / pushback
- **Don't add a queue product on top of Modal** — biggest over-engineering risk. QStash can't even run the job (60 s).
- **Cloudflare Containers is wrong for a paid 15–25 min job** (no guaranteed runtime).
- **Cold starts don't matter** vs a 15-min job — don't pay for always-on warm workers.
- **Compute cost ≠ your cost — tokens are.** Optimize model/verify-loop spend; benchmark it.
- **MoR vs Stripe is a tax-ops tradeoff**, not just fees — take the ~5% MoR early to avoid worldwide VAT registration/filing.
- **Playwright in the container:** `playwright install --with-deps chromium`, ~4 GB RAM; use `chromium-headless-shell`.

## Key sources
- Modal: modal.com/pricing · modal.com/docs/guide/job-queue · docs/reference/modal.FunctionCall
- Fly: fly.io/pricing · Railway/Render: northflank.com/blog/railway-vs-render · Cloudflare Containers: developers.cloudflare.com/containers/platform-details/architecture
- Queue: pkgpulse inngest-vs-triggerdev-vs-qstash-2026 · trigger.dev/pricing · supabase.com/docs/guides/queues
- Billing: Polar credits docs.polar.sh/features/usage-based-billing/credits · better-auth.com/docs/plugins/polar · Stripe credits docs.stripe.com/billing/.../billing-credits · MoR comparison fintechspecs.com
- Anthropic: claude.com/programs/startups
