# Research — Auth for Next.js 16 (Google + Apple, free-to-start, stable id for billing) (2026-07)

## TL;DR
**Better Auth** — self-hosted, $0 with no MAU cap, owns the `user.id` in your own DB, first-class Next.js 16,
drop-in Google + Apple. **Supabase Auth is the runner-up** and becomes the default *if the DB is Supabase*
(auth + Postgres + a `user_id` FK in one). Biggest gotcha is **Apple, not Google**: Apple requires a paid
$99/yr Developer Program and a client-secret JWT that silently expires every 6 months.

## Comparison

| Solution | Free tier (MAU) | Card? | Google | Apple | Next.js 16 fit | Managed / self-host |
|---|---|---|---|---|---|---|
| **Better Auth** | Unlimited (OSS, you host) — $0 | No | ✅ | ✅ | Excellent (handles v16 `middleware`→`proxy`) | Self-host (your DB) |
| **Supabase Auth** | 50,000 MAU | No | ✅ | ✅ | Good (`@supabase/ssr`) | Managed / OSS |
| **Auth.js (NextAuth v5)** | Unlimited (OSS) | No | ✅ | ✅ | Rougher; maintainers now point new projects to Better Auth | Self-host |
| **Clerk** | ~10,000 MAU (verify current) | No | ✅ | ✅ | Excellent | Managed |
| **WorkOS AuthKit** | 1,000,000 MAU | No | ✅ | ✅ (OIDC) | Good | Managed |
| **Stytch** | 10,000 MAU | No | ✅ | ✅ | Good | Managed |
| **Firebase Auth** | 50,000 MAU | **Yes (Blaze card)** | ✅ | ✅ | Not idiomatic App Router | Managed |

## Recommended: Better Auth
- **Free, no card, no MAU cliff** — costs only your DB/host (already chosen). A viral spike carries no auth invoice.
- **Stable user id you own** — `user.id` in your DB; the credits/subscription row is a plain FK. No cross-vendor id mapping.
- **Google + Apple drop-in**; docs address Apple's client-secret expiry.
- **Built for Next.js 16**; migrating the localStorage "ref" → real accounts is natural (link owned games to the new id in one DB transaction).
- Cost: you own session/CSRF/provider config (small surface for Google + Apple only).

## Runner-up: Supabase Auth
Pick **if the DB is Supabase** — 50k MAU free, no card, `auth.users` UUID as the billing FK, all in one system.
**Honorable mention — WorkOS AuthKit**: 1M MAU free, managed, but optimized for the B2B SSO upsell (irrelevant to B2C games).

## Apple gotchas (budget real time)
- **$99/yr Apple Developer Program required** — the one line item that breaks "totally free to start". No free path.
- Six coordinated pieces: App ID, **Services ID** (= the OAuth client_id), Team ID, Key ID, downloaded `.p8` key, redirect URI.
- **Client secret is a JWT that Apple rejects if it expires >6 months out** → if pasted into an env var it **silently breaks ~6 months later**. Generate per-request/on rotation (Better Auth + managed vendors do this).
- **No localhost / non-HTTPS redirects** — test against a real HTTPS domain.
- Apple returns name/email **only on first authorization**; users can **Hide My Email** — persist on first login, key on the Apple `sub`, not email.

## Google gotcha
Basic scopes (openid/email/profile) are non-sensitive (no security review), **but** brand verification (domain in Search Console + privacy policy, ~2–3 business days) is needed to avoid the "unverified app" consent warning under viral traffic.

## Pushback
1. **"Free to start" vs Apple are in tension** — launch **Google-only**, add Apple after revenue justifies the $99 + rotation complexity. Every option supports adding Apple later without re-architecting.
2. **Let the DB choice drive auth:** DB=Supabase → Supabase Auth; billing=Clerk (shipped account credits June 2026) → consider Clerk Auth to collapse auth+billing. Cleanest end-states: **(A) Better Auth + own Postgres + Stripe/your billing**, **(B) all-Supabase**, or **(C) all-Clerk**. Avoid mixing (a user-id bridge + webhook sync).
3. **Skip Firebase/Auth.js here** — Firebase needs a card at scale + non-idiomatic; Auth.js v5 has migration friction and its own maintainers redirect to Better Auth.

## Key sources
- Better Auth: better-auth.com · /docs/integrations/next · /docs/authentication/apple · issue #1522 (Apple secret expiry)
- Supabase: supabase.com/pricing · WorkOS: workos.com/pricing · Clerk: clerk.com/pricing · clerk.com/billing (account credits)
- Apple: developer.apple.com/programs/enroll ($99) · client-secret rotation (bannister.me)
- Google brand verification: developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- 2026 comparisons: LogRocket "best auth library nextjs 2026" · pkgpulse best-nextjs-auth-solutions-2026
