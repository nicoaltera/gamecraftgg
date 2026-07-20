# GameSight — Production Serving Plan (cleanest minimal stack)

_Written 2026-07-19. Synthesizes three research passes (see `research/`). Goal: get GameSight
publicly served with real auth, a credits + subscription model, and **no upfront payment** — using
free tiers and startup credits — while keeping the stack minimal and operable by a tiny team (or one agent)._

The founder's goals, restated as requirements:
1. **Serve it** publicly and cheaply (the app + the untrusted game bundles).
2. **Auth** — real accounts (Google sign-in; Apple later).
3. **Deploy the frontend cheaply, no card** — free tiers / free credits.
4. **Credits** — generating a game costs credits; new users get free credits; fund early usage with free **Anthropic** credits.
5. **Subscription** — buy more credits.
6. **Playing is free.**
7. **Minimal and very doable.** No over-engineering.

---

## The recommended stack (one coherent, all-free-to-start set)

| Concern | Choice | Why (tied to the goals) | Free to start / no card? |
|---|---|---|---|
| **App host** | **Cloudflare Workers** (Next.js 16 via OpenNext) | Only host with **unlimited free bandwidth + commercial use + no credit card** — the decisive property for a free-to-play viral site that could spike | ✅ no card |
| **Database** | **Turso (libSQL)** | Near **drop-in for `better-sqlite3`** (same SQLite dialect; schema migrates almost verbatim; only change is queries become async). Host-agnostic (HTTP), so it isn't locked to Cloudflare | ✅ no card |
| **Auth** | **Better Auth** (self-hosted in the app, Turso-backed) | **$0, no MAU ceiling**, owns the `user.id` in *your* DB so billing attaches with a plain foreign key; Google + Apple are drop-in; first-class Next.js 16 | ✅ no card |
| **Game origin** (untrusted bundles) | **Separate Cloudflare Pages project or R2 bucket** on a **distinct domain** | Genuine cross-origin isolation for machine-generated code; strict CSP via a `_headers` file; `iframe sandbox` without `allow-same-origin`; R2 has **$0 egress** | ✅ no card |
| **Generation worker** | **Modal** | The one option that is a **long-running container (browser + real filesystem) *and* a durable async job queue** in one, with **$30/mo free credits, no card**. Per-15-min job compute ≈ $0.03–0.05 (noise vs Claude tokens) | ✅ no card |
| **Queue + "leave & come back"** | **Modal `.spawn()` + one `generations` DB row** as source of truth | Job lives on Modal, not the browser → survives tab-close. No separate queue product needed | ✅ |
| **Billing (credits + subscription)** | **Polar** (Merchant of Record) | Native **prepaid-credits + subscription** primitives; **remits worldwide VAT/sales tax for you** (the real hidden cost for a small team); no monthly fee; official Better Auth plugin | ✅ no card |
| **Fund early generation** | **Anthropic — Claude for Startups** (up to ~$25k credits) + $5 new-account trial | Directly funds the token cost of generation while you find price | ✅ |
| **Notify on done** | **Resend** (email) + later web-push (service worker + VAPID) | "We'll ping you when it's ready." The in-app cooking tray already does browser notifications while a tab is open | ✅ |

**The only things that cost money up front:** a domain (~$12/yr) and — *only if you add Apple sign-in* — the Apple Developer Program ($99/yr, deferrable). Everything else starts at $0 with no card.

**Runner-up stack (if you prefer DX over free-bandwidth):** Vercel (best Next.js DX) + Turso + a second Vercel project for games + Fly.io/Railway worker + Stripe. Accept: Vercel Hobby is **non-commercial-only** and its **100 GB cap pauses your site**, so a monetized/viral site moves to **$20/mo Pro** quickly; Fly/Railway need a card; Stripe is ~2 points cheaper but you own worldwide tax.

---

## How it maps onto today's code

Today: Next.js 16 app, `better-sqlite3` local file, self-contained game bundles served through a Next route with CSP, `pipeline/run.mjs` spawned locally (uses the `claude` CLI + Playwright), ownership via a localStorage "ref", no billing.

Changes, smallest-to-largest:

1. **DB: `better-sqlite3` → `@libsql/client` (Turso).** *Required regardless of host* — `better-sqlite3` is a native module and serverless filesystems are ephemeral, so a local `.sqlite` can't persist. The schema is already portable SQL. The real work is making DB calls **async** in `lib/db.ts` and its callers. Keep a `file:` libSQL URL for local dev.
2. **Game origin:** deploy the `games/` bundles to a separate Cloudflare Pages project / R2 on a distinct domain; set `NEXT_PUBLIC_GAME_ORIGIN` (already referenced in the code) + the strict CSP there. This closes the "separate origin" launch gap already documented in the app README.
3. **Auth: add Better Auth** (Google provider first). Create the `user` row on first sign-in and **link the existing localStorage `ref`'s owned games to `user.id`** in one transaction. Replace `getRef()`-based ownership with the session user id.
4. **Generation → Modal.** Package `run.mjs` + `claude` CLI + Playwright/Chromium into a Modal image with a Volume for the working dir; the generate route calls `.spawn()`, writes the `generations` row (already exists), and returns immediately. The worker writes the terminal state + uploads the bundle + triggers the ping. The **cooking tray** and `/build/[id]` already poll that row, so the UI needs no change to support durable leave.
5. **Billing: add Polar.** A subscription product grants N credits/cycle; a `game_generated` meter burns the balance; new users get a starter grant. Gate the generate route on `balance > 0`. Fund the Anthropic key with startup credits.

---

## Phased rollout (each phase independently shippable)

- **Phase 0 — Serve it (no auth, no billing).** DB → Turso; deploy app to Cloudflare (OpenNext); deploy game bundles to the separate origin with CSP. Outcome: the site is public and free to play, $0, no card. _Ownership still localStorage for now._
- **Phase 1 — Accounts.** Better Auth + Google sign-in; migrate ownership from the localStorage ref to real user ids. Outcome: durable "your games", ready for billing to attach.
- **Phase 2 — Durable generation.** Move `run.mjs` to a Modal worker; wire the tray's "ping" to real email (Resend). Outcome: "leave, we'll ping you" is truly tab-close-safe.
- **Phase 3 — Credits + subscription.** Polar products (credit packs + subscription); meter generations; grant free starter credits; gate generation on balance; apply Anthropic startup credits. Outcome: the business model is live; playing stays free.
- **Later:** Apple sign-in ($99), true web-push (service worker + VAPID), scale tuning (Cloudflare Workers Paid $5/mo if you outgrow free CPU/bundle; Modal beyond $30/mo).

---

## Honest pushback (where the ask should bend)

1. **Apple sign-in is not free.** It *requires* the Apple Developer Program ($99/yr) and a client-secret JWT that silently expires every 6 months. **Launch Google-only** (covers the vast majority of web users, free), add Apple once revenue justifies it. Highest-leverage simplification.
2. **Don't stack a queue product on Modal.** `.spawn()` + a `generations` DB row *is* the queue-and-notify system. Inngest/Trigger.dev/QStash are redundant here (QStash's 60 s timeout literally can't run a 15-min job). This is the biggest over-engineering trap in the brief.
3. **Don't launch on Vercel Hobby.** It's non-commercial-only and its 100 GB cap *pauses* the site — exactly the wrong failure mode for "viral + free to play". Cloudflare avoids both.
4. **`better-sqlite3` can't come along** — this migration is mandatory, not optional, the moment you leave a single always-on box. Turso makes it a near-drop-in; do it first.
5. **Pay the Merchant-of-Record premium (Polar ~5%) early.** It buys away worldwide VAT/sales-tax registration and filing — a real ongoing liability for a tiny team. Migrate to Stripe (~2.9%) later if volume justifies owning tax ops.
6. **Cost-per-game is dominated by Claude tokens, not infra** (~$0.03–0.05 compute vs potentially dollars of tokens, ×up-to-3 verify cycles). **Benchmark real token spend per game before pricing a credit.** This remains the true go/no-go, and it's independent of every vendor choice above.
7. **Keep it all-Cloudflare where you can** (app + game origin in one dashboard) but keep **Turso over D1** so the DB stays portable rather than welded to Workers.

---

## Cost trajectory

- **Launch:** ~$0 + a domain (~$12/yr). Anthropic startup credits absorb generation token cost.
- **Growing:** Cloudflare Workers Paid ~$5/mo (only if you outgrow free CPU/bundle); Modal beyond its $30/mo free credits; Polar takes ~5% of revenue (tax included).
- **The number that decides viability:** measured Claude-token cost per published game × margin → price per user credit, with enough free starter credits for ~1–3 games so the funnel works.

See `research/hosting-db.md`, `research/auth.md`, `research/compute-billing.md` for the full option matrices and citations.
