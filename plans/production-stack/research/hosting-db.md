# Research — App hosting, database, and game-bundle origin (2026-07)

## TL;DR
**Cloudflare Workers (Next.js 16 via OpenNext) + Turso (libSQL) + a separate Cloudflare Pages/R2 game origin.**
All three start free, none needs a credit card, all permit commercial use, and Cloudflare's free tier has
**no bandwidth cap** — the single most important fact for a free-to-play viral games site. Runner-up:
Vercel + Turso + a second Vercel project, but Vercel Hobby is **non-commercial only** with a 100 GB cap that
pauses the site, forcing a $20/mo Pro upgrade.

## 1. App hosting for Next.js 16

| Host | Free tier | Card? | Commercial on free? | Next.js 16 SSR + headers | Cost when it grows |
|---|---|---|---|---|---|
| **Cloudflare Workers/Pages** | **Unlimited bandwidth**; Workers 100K req/day, 10 ms CPU/req, ≤3 MiB gzip bundle | **No** | **Yes** | Yes — OpenNext `opennextjs-cloudflare` 1.0 GA (Feb 2026), supports Next 16; route handlers + `_headers` CSP work | Workers Paid $5/mo (10 MiB bundle, more CPU); bandwidth stays free |
| **Vercel** | 100 GB bandwidth, 100 build-min, 1M invocations; pauses at limits | No | **No — non-commercial only** | Yes — first-party | Pro $20/seat/mo; $0.15/GB over |
| **Netlify** | ~15 GB bandwidth (credit model), 10 s function timeout | No | Yes | Yes (Next 16 ready) | $9–20/mo |
| **Render** | Free web only, spins down ~1 min idle | No | Yes | Works, cold starts hurt | ~$7/mo always-on |
| **Railway / Fly.io** | No real free tier ($5 trial), **card required** | Yes | n/a | Works | per-usage |
| **Deno Deploy** | Weak Next.js SSR fit — not recommended | No | Yes | Poor | n/a |

**Takeaways:** Cloudflare is the only host with unlimited bandwidth + commercial use + no card on free. Vercel has the best DX but Hobby is non-commercial and its 100 GB cap *pauses* the site — both disqualifying for viral free-to-play. Netlify's bandwidth is tighter than Vercel. Render/Railway/Fly are container hosts (Render only no-card, but cold starts).

## 2. Database (replace `better-sqlite3`)

| DB | Free tier | Card? | Fit from route handlers | Migration from SQLite |
|---|---|---|---|---|
| **Turso (libSQL)** | 5 GB, 500M row-reads/mo, no card | **No** | **Best** — HTTP/edge-native; `@libsql/client` near-drop-in for better-sqlite3 (queries async) | **Lowest** — it *is* SQLite; schema runs nearly unchanged |
| **Neon (Postgres)** | 0.5 GB/project, 100 CU-hrs, scale-to-zero | No | Good (HTTP driver) | Moderate (SQLite→Postgres port) |
| **Supabase (Postgres)** | 500 MB, **pauses after 7 days idle** | No | Good | Moderate; 7-day pause is a footgun |
| **Cloudflare D1 (SQLite)** | 5 GB, ~150M rows-read/mo, no card | No | Excellent *if on Workers* (couples DB to host) | Low, but D1-specific API |
| **PlanetScale** | **No free tier** | Yes | — | excluded |

**Takeaways:** Turso is the natural `better-sqlite3` replacement — same dialect, portable schema, host-agnostic (HTTP), `file:` mode for local dev. Meters **row-reads** (index hot paths). D1 is cheapest-integrated only if you commit to Workers (locks the DB to the host). Turso keeps portability.

## 3. Serving untrusted game HTML on a separate origin

Standard pattern: genuinely different **registrable domain**, `iframe sandbox="allow-scripts"` **without** `allow-same-origin`, strict CSP. Options: a **second Cloudflare Pages project** (simplest — `_headers` CSP, unlimited bandwidth) or **R2 + custom domain** (`$0 egress`, ideal for many generated bundles). A same-site subdomain is *not* enough isolation (cf. CVE-2026-27578 CSP-sandbox bypass).

## Gotchas / pushback
1. **`better-sqlite3` cannot follow you to serverless** — native module + ephemeral FS wipes the local file between invocations. Replace with `@libsql/client`.
2. **Vercel Hobby "free" is a trap here** — non-commercial terms + 100 GB cap that pauses. A monetized/viral site hits both.
3. **OpenNext, not native, on Cloudflare** — mature (1.0 GA) but watch the 3 MiB gzip Worker bundle on free ($5/mo Paid = 10 MiB). Test the deploy early.
4. **Turso meters row-reads** — index the hot paths.
5. **Separate origin must be a separate registrable domain**, not a path/subdomain.
6. **Supabase auto-pauses free after 7 days idle.**
7. **Simpler path:** all-Cloudflare (app + game origin, one dashboard), Turso over D1 for portability.

## Key sources
- Vercel Hobby limits & Fair-Use (non-commercial): vercel.com/docs/plans/hobby · vercel.com/docs/limits/fair-use-guidelines
- Cloudflare: cloudflare.com/plans/developer-platform · opennext.js.org/cloudflare · developers.cloudflare.com/pages/configuration/headers
- Turso: turso.tech/pricing · github.com/tursodatabase/turso · turso.tech/blog/serverless
- Neon: neon.com/pricing · Supabase: supabase.com/pricing (7-day pause) · D1: developers.cloudflare.com/d1/platform/pricing · R2: developers.cloudflare.com/r2/pricing
- Isolation: OWASP CSP Cheat Sheet · iframe sandbox best practices · CVE-2026-27578 (n8n CSP sandbox bypass)
