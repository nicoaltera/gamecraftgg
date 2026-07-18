# 07 — Open Questions (founder decisions; ask before resolving)

1. **Product name.** "GameSight" is the working/folder name. Never validated as a brand. Domain search + a naming pass needed before launch.
2. **Free quota size.** How many generations/day per creator? Depends entirely on the Phase 0 cost benchmark. Also: do failed generations (below-bar, not published) consume quota? (Suggestion: half-cost, so critique-and-retry doesn't feel punitive.)
3. **Model + agent stack for the pipeline.** Which models per role (designer/builder/judges/play-tester), and which agent harness runs the build workers. Founder likely has strong opinions and existing infrastructure preferences — ask.
4. **Hosting.** Vercel + Cloudflare (CDN/sandboxed origin) + Supabase/Neon Postgres is the obvious fast stack; confirm before building.
5. **Publish threshold tuning.** Rubric gate is ≥80 + zero critical fails; the real number comes out of golden-set calibration. Who signs off on the calibration set — founder should personally taste-test it.
6. **Below-bar games.** Hard-block publish (current spec) vs. publish-unlisted with a "rough sketch" badge (shareable but never in feed). Current spec says hard-block; revisit if creators churn on failed generations.
7. **Legal/IP.** Terms for prompt-derived games ("make me Flappy Bird" → clones): where's the line the content judge enforces? Also game code ownership/export — creators currently can't export; is that fine for v1?
8. **Seed content authorship.** The ~20 launch games: shown under a house creator name, or anonymous? (Transparency vs. empty-room dynamics.)
9. **Age rating / COPPA posture.** School-age kids will find this (that's partly the point). No-account play helps; creator accounts need an age gate decision.
10. **Analytics stack.** K-factor instrumentation is bespoke (referral edges in Postgres); do we also want a product analytics tool day one?
