# GameSight — Planning Folder

**Status:** Planning complete, design approved by founder (2026-07-18). Nothing has been built.
**What this is:** A prompt-to-game site. Anyone prompts → agents design, build, and verify a browser game → it publishes to a shareable URL → anyone plays it instantly, no account. Single-player games get leaderboards and "beat my score" challenge links; multiplayer games get invite-link party rooms. The bet is the viral loop (K-factor), not the AI.

**Positioning rule:** never brand as "AI games" (player sentiment on gen-AI is ~85% negative). Brand: **"games with your friends in 60 seconds."** The AI is an implementation detail.

## How to use this folder (for the implementing agent)

Read in order:

1. `01-product-spec.md` — product shape, player/creator loops, viral mechanics, success metrics
2. `02-generation-pipeline.md` — the agentic design→build→verify pipeline (the core of the product)
3. `03-quality-rubric.md` — the judge rubric every game must pass before publishing
4. `04-site-design-language.md` — **strict** site design system (founder-mandated: clean whites, hand-drawn, high taste). Follow exactly
5. `05-architecture.md` — platform stack, APIs, party rooms, anti-cheat, moderation
6. `06-roadmap.md` — phases, risks, deferred v2 backlog
7. `07-open-questions.md` — decisions still owned by the founder; ask before resolving unilaterally

`research/` contains the seven deep-research reports the design is grounded in. Cite them; don't re-derive. Note the deliberate breadth: `game-feel-quality-bar.md` (N/Heli Attack) is two data points, not the whole bar — `top-flash-games-dna.md` (the top-22 canon, cross-genre laws, and the **three fun-drive dials**: comedy/spectacle, mastery, progression), `launch-genre.md` (Learn to Fly/Flight and the bank-every-attempt pattern), and `physics-toys.md` (Line Rider/QWOP-class toys and spectacle) exist specifically so the generator's creative space stays wide. The rubric is archetype-conditional for the same reason.

## Locked decisions (founder-confirmed 2026-07-18)

| Decision | Choice |
|---|---|
| Ambition | Fast viral experiment — ship in days, invest more only if K-factor shows life |
| Multiplayer scope v1 | Single-player + ≤8-player invite-link party rooms (Playroom Kit); live arenas deferred |
| Generation model | **Pure freeform**: builder agent writes a self-contained `index.html`; no platform SDK; pinned CDN whitelist; conventions doc; **agents verify everything** |
| Verification | **Agentic, not deterministic tests**: play-tester + judge agents in the build loop at runtime, scoring against the rubric. LLM-verified, iterate until pass |
| Design phase | Heavy planning and clarification baked into the agent loop: a game-designer agent produces a design brief (mechanics, look, feel, high taste) before any code; clarifying questions to the creator when ambiguous |
| Rendering | Both from day one: Phaser 3 (2D) and three.js (3D), orchestrator routes by prompt |
| Mobile | **Touch required** — publish gate fails any game that doesn't play well on a phone |
| Creation access | Play = zero friction, no account. Create = one-tap login (Google/Apple) + free daily generation quota |
| V1 viral loops | Challenge links (score-in-URL + OG card) + retention-ranked discovery feed |
| Deferred loops | Remix lineage, free-text name-tags/party memes → v2 |
| Success metric | K-factor / share rate: invites-per-player and challenge-link conversion, aiming toward K≈1 in any cohort |
| Anti-cheat v1 | Accept cheating, design around it (per-game boards, anomaly heuristics); replay validation is v2 |

## The one-paragraph pitch

The flash portal era proved the game itself is the viral unit (the SWF carried the brand and ads wherever it was rehosted) and Agar.io proved URL = instant session is the strongest referral mechanic ever shipped. Every current prompt-to-game competitor (Rosebud, Astrocade $56M, Roblox Build — launched July 2026) funds the creation side and ships broken, samey, keyboard-only games with no player-side platform. GameSight's edge: an agentic build loop with real taste and real verification (agents design, play, and judge every game before it publishes), platform-owned leaderboards/challenge-links/party-rooms, and a player experience tuned to one number — K.
