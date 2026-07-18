# 01 — Product Spec

## Player loop (no account, ever)

1. Click a shared link → **playing in under 3 seconds**. No login, no splash, no menu — direct to gameplay (Poki's bar; see `research/competitive-landscape.md` §4).
2. Death/game-over screen is the viral surface. It shows, in priority order:
   - score + best score (localStorage) + **instant retry** (default focused action, <1s, one keypress)
   - **challenge link**: "Beat my 4,720" — copyable URL with the score baked in, plus native share sheet on mobile
   - **"Make your own game"** CTA — the player→creator conversion funnel
3. Challenge links: `gamesight.xyz/g/<slug>?c=<score>&r=<referrer-id>`. The game displays "TARGET: 4,720" during play (convention, agent-verified). The OG preview card renders the game's cover frame + the score, so the link looks like a dare in any chat.
4. Party games: **the invite link is the room.** Opening it puts you in your friend's live session (Playroom Kit room ID in URL). No lobby friction beyond picking a name.

## Creator loop

1. One-tap login (Google/Apple) → prompt box. Free daily generation quota (see `07-open-questions.md` for exact number).
2. **Clarification step:** if the prompt is ambiguous on genre/feel/mode, the designer agent asks up to 2–3 quick multiple-choice questions (single-player or with friends? fast-twitchy or puzzly? vibe/art direction?). Skippable — a bare prompt must still produce a great game using opinionated defaults.
3. **Live build theater:** the creator watches the agents work — designer writing the brief, builder writing code, the play-tester agent *actually playing the game* in a visible browser, judges scoring. This is spectator content and inherently shareable; design the build page to be screen-recorded.
4. Publish → URL. Further prompts on a published game trigger a new design→build→verify cycle on the same slug (multi-turn editing is just re-entry into the pipeline).
5. If a game fails the publish gate after the cycle budget, the creator sees the judges' critique in plain language and can re-prompt. Never publish a below-bar game to the feed.

## Discovery

- Homepage feed ranked by **retention, not recency or creator status**: plays, replay rate (retries per session), session length, challenge-link conversion. Roblox's anti-slop rule: if no one plays it, no one can find it.
- A "new releases" rail gives every freshly published game a fair exposure window (N impressions or M hours) before retention ranking takes over — otherwise cold-start kills everything.
- Every game page shows: play (instant), leaderboard, creator name, share/challenge buttons.

## Leaderboards & modes

- **Single-player:** per-game leaderboard (daily + all-time tabs), name claimed at score-submit time (moderated word filter), high score persisted client-side too.
- **Party (≤8):** Playroom-based rooms; per-room results screen with share card. Session leaderboards only in v1.
- Every game declares its mode in metadata at design time; the pipeline wires the right service.

## K-factor instrumentation (day one, non-negotiable)

Every link carries a referral edge: who shared → who clicked → did they play (≥30s) → did they share → did they create. Dashboard metrics:

- **K = invites sent per player × conversion of invite to player** (measure per cohort per week)
- challenge-link CTR and play-through rate
- player→creator conversion rate ("make your own" clicks → published games)
- viral cycle time (share → new player's first share)

The experiment graduates when any cohort approaches K≈1. That decision gate is the whole point of v1.

## What v1 is not

No remix/fork button, no free-text name-tags in-game, no arenas, no creator payouts, no comments, no mobile app. See `06-roadmap.md` deferred list.
