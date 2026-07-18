# 06 — Roadmap, Risks, Deferred

## Phase 0 — prove the loop (days 1–3)

Goal: one great game end-to-end, before any site exists.

1. Build the pipeline runner: designer → builder → play-tester → judge panel → iterate (CLI-invoked, local).
2. Golden-set calibration: hand-build reference passers spanning the archetypes (mastery, progression launcher, comedy/spectacle, toy — per `03-quality-rubric.md`) and failers; tune judge prompts until verdicts match human taste.
3. **Cost benchmark (go/no-go input):** measure tokens + wall-clock per published game across ~10 varied prompts on both rendering routes. This sets the quota, cycle budget, and whether freeform-everything is affordable.
4. Score API + a bare publish page (game in hand-drawn frame + leaderboard).

Exit criteria: 3 consecutive novel prompts → published games that a human rates "I'd send this to a friend," at a known cost per game.

## Phase 1 — launch the experiment (≈week 1–2)

1. Site per `04-site-design-language.md`: home (prompt hero + feed), game pages, build theater, auth + daily quota.
2. Challenge links + OG cards; K-factor instrumentation (referral edges) wired into every link.
3. Retention-ranked feed + new-release exposure window.
4. Moderation basics: content judge, name filter, report button.
5. Launch: seed the feed with ~20 in-house generated games spanning genres (the feed must not look empty or samey on day one).

Exit criteria: live, K-dashboard reporting, first outside cohorts measured.

## Phase 2 — the friend loop (week 3+)

1. Party rooms (Playroom Kit path): designer agent can choose party mode, invite links, room UX chrome.
2. Mobile polish pass on the top-played games' control patterns; fold learnings back into CONVENTIONS.md (living document — this is the "skills/guides" idea: conventions improve from observed failures).
3. Judge/cost tuning from production traces.

## Decision gate

Run cohorts for 2–4 weeks. **Graduate** (fund the bigger build) if any cohort's K approaches 1 or a game organically breaks out. **Iterate** if challenge-link CTR is strong but creation lags (lean into remix). **Stop** if shares don't convert to plays.

## Deferred — v2 backlog (do not build in v1)

- **Remix lineage** — "remix this" fork button + visible family tree + attribution (websim's engine; highest-leverage next loop)
- **Name-tags / party memes** — free-text identity in party games (Agar.io's broadcast trick; needs moderation muscle first)
- **Live arenas** — Agar.io-scale rooms: Cloudflare Durable Objects (partyserver), LLM-written deterministic reducers run in sandboxed isolates (Dynamic Worker Loader / QuickJS-WASM), 10–20Hz snapshots. Researched and viable; see `research/framework-infra.md` §3
- **Replay-validated leaderboards** — seeded RNG + input logs re-simulated server-side (Open Hexagon pattern)
- **Creator economy** — plays-gated payouts (Astrocade's 100K-plays model) and/or sponsor slots (fly.pieter.com's proven pattern); status rewards (badges, featured, remix credits) come first
- **Streamer tooling** — "join my room" links, clip/export affordances (streamers are the K-multiplier; earn them with spectacle)
- **Community judgment queue** — Newgrounds-style pre-exposure voting if generation volume outruns judge capacity
- **3D showcase track** — deeper three.js investment once QA is proven

## Top risks

1. **Cost per published game.** Freeform + multi-judge + cycles could be dollars per game. Phase 0 benchmark is the go/no-go. Levers: cycle budget, judge panel size, model tiering per role, quota.
2. **Judge reliability.** Agents passing broken games (users share a dud — trust gone) or failing good ones (creators churn). Mitigation: golden-set regression on every judge-prompt change, verdicts-with-evidence, weekly human audit of samples.
3. **Freeform breakage tail.** No SDK means touch controls and score wiring are re-derived every game; expect a stubborn failure tail. Mitigation: CONVENTIONS.md is a living doc — every recurring failure becomes a convention + judge check (founder's "skills/guides" instinct).
4. **Samey feed.** The archetype-convergence trap. Mitigation: designer agent's mandatory twist + taste judge's anti-samey check against recent feed.
5. **Gen-AI stigma.** Never market as AI games; the product is "games with your friends in 60 seconds."
6. **Roblox Build / Astrocade.** Incumbents own creation inside walled gardens. Our wedge is the open web: a URL that opens instantly anywhere, no app, no account, adult/teen web-native audience.
7. **Untrusted code on our domain.** Sandboxed origin + CSP + iframe sandbox from day one (see `05-architecture.md`); one XSS incident kills a link-sharing product.
