# DESIGN_BRIEF — Rattlesnake Noon

**One-line pitch:** A spaghetti-western quick-draw gauntlet where losing the draw isn't losing the duel — read the bullet, lean out of its path in slow motion, and counter-kill.

---

## Fun-drive dials (the load-bearing decision)

**Mastery 60% · Comedy/Spectacle 25% · Progression 15%**

- **Mastery is the engine.** Every duel is a 5–20 second reaction-and-read test with an instant, zero-cost retry. The player's improvement is measured in milliseconds and displayed in milliseconds.
- **Comedy is the failure channel.** Death is never a sad screen: hats rocket off, the player character pirouettes into a water trough, fouls trigger a comedic gun-fumble. Losing produces a screenshot.
- **Progression is the wrapper.** A ladder of ten named gunslingers with wanted posters, plus a persistent bounty wallet, gives every session a "one more poster" seam. Checkpoints bank your climb — no run earns zero.

Everything downstream (failure model, difficulty, judging) follows from this blend: retries must be instant, deaths must be entertaining, and the ladder must be visible at all times.

## Concept & core verb

**Core verb (≤5 words): "Out-draw or lean-dodge."**

Side-view standoff against one gunslinger. A tense random wait → the **DRAW!** signal → whoever reacts first fires. If the enemy out-draws you, time collapses into slow motion: their bullet travels toward your head or your hip, telegraphed by their barrel angle, and you have one shrinking window to lean the correct way. Survive the lean and the duel continues as an exchange — re-cock, fire, they may dodge too — until someone eats lead.

Legible in 5 seconds: two silhouettes, a sun, a word that says DRAW. Depth comes from the verb's consequences — foul risk, fake-outs, the lean read, and the exchange loop — not from more verbs.

**Interesting-decisions audit (the honest interrogation):**
1. *Standoff:* hair-trigger anticipation vs. foul risk. Enemies fake-twitch specifically to farm your eagerness. The optimal move is never "just mash" — mashing fouls you.
2. *Out-drawn:* a live binary read under a 220–500 ms deadline — barrel dips = low shot, lean is the wrong-way trap. Success is earned (you saw the tell); failure is legible (the replay flash shows the tell you missed).
3. *Risk/reward (Showboat):* you may deliberately **hold your fire**, bait their shot, dodge it, and take a guaranteed counter for **2× bounty**. Fast draw is safe money; showboating is rich money. This is a real strategic choice on every single duel.

No move is obvious-and-repeated; no outcome is arbitrary. Passes.

**Player-performs-the-mechanic law:** Retry (R / tap) returns to the pre-signal standoff of the *current* opponent — hand hovering, wind blowing, signal not yet given. Nothing ever auto-draws, auto-fires, or auto-leans. A challenge link (`?c=`) also opens at the standoff, never mid-replay.

## The twist (anti-samey)

Quick-draw games are a solved one-dimensional reaction test. **The lean is the twist:** losing the draw opens a second, richer game — a slow-motion bullet-read — so the reaction test becomes a two-layer bluffing structure (they fake your draw; the barrel tell fakes your lean at high ranks). The **Showboat bonus** inverts the genre's whole premise: the strongest play in a quick-draw game can be *not drawing*. Constraint mutation: exactly two inputs (FIRE, LEAN), context-modal, nothing else.

## Failure model

Two of the three approved shapes, layered:

- **Instant zero-cost retry (mastery):** death → 900 ms comedic tumble → standoff of the same opponent. No menus, no lives, no ladder reset. Defeated gunslingers stay defeated (checkpoint = the poster wall).
- **Failure-as-spectacle (comedy):** player death is a physics-flavored flop (hand-keyed 3-pose tumble + hat arc + dust; no physics engine needed). A **foul** (drawing before the signal) is *not* an instant loss — you fumble the revolver comically and must survive the enemy's free shot with a lean only. Fouling turns your mistake into the game's tensest moment. Boring failure is banned; every loss is either funny or a legible lesson (the kill-cam flash freeze shows the tell for 700 ms).

Bank-every-attempt is present in weak form (bounty wallet persists), but the design does not lean on grind — persistence alone cannot beat El Mediodía; only reads can.

## Structure & escalation

**Session quantum:** one duel = 5–20 s; a ladder push = 2–5 min. Seam: beating a slinger slides the next wanted poster in with their bounty and a one-line taunt — the "one more" is the poster itself.

**The ladder (10 named slingers — escalation in KIND, not just numbers):**

| # | Name | Reaction | New behavior (visible spectacle) |
|---|------|----------|----------------------------------|
| 1 | Prairie Pete | 900 ms | None. Teaches the draw. |
| 2 | Two-Bit Tuck | 750 ms | Fake twitch (farms fouls). |
| 3 | "Sidewind" Sally | 650 ms | Dodges your shot 30% → first exchanges. |
| 4 | Deacon Boone | 600 ms | Signal is a *church bell*, not text (audio tell). |
| 5 | The Ferris Kid | 550 ms | Fires **twice** — two leans, alternating tells. |
| 6 | Doc Absinthe | 500 ms | Long, cruel fakes; wait can stretch to 6 s. |
| 7 | Curly Mott | 450 ms | Fake-draw that fires late (double-layer bluff). |
| 8 | Hex Marlowe | 400 ms | Masked telegraph — tell window halves. |
| 9 | Widow Vane | 360 ms | Dodges 60% + double-tap. Everything at once. |
| 10 | El Mediodía | 320 ms | All behaviors; duel at a blood-red noon. Story resolves here. |

**Long tail:** beating El Mediodía unlocks **Legends Road** — endless procedurally-scaled slingers (reaction floor 280 ms, lean window floor 180 ms, tells increasingly masked) with bounties that scale ×1.5 per head. The ladder is where the story ends; Legends is where the flex lives. Far ceiling: the $1,000,000 bounty "Ghost of the Mesa," practically unreachable.

**Risk/reward layer:** the Showboat bonus (hold fire → dodge → guaranteed counter, 2× bounty) on every duel; higher-rank Showboats multiply further (rank 8+: 3×).

**Brag numbers (always visible):** persistent **BOUNTY $** top-right; **best draw (ms)** stamped on every victory freeze-frame and kept as personal best top-left. Leaderboard metric = single-run bounty. Escalation is spectacle-forward: denser tumbleweeds, redder skies, bigger muzzle flashes, longer slow-mo as ranks climb.

**Timing constants (the risk surface — explicit):** signal delay uniform 1.2–4.5 s (Doc Absinthe: up to 6 s); foul = any FIRE input pre-signal; lean window 500 ms (rank 1) → 220 ms (rank 10) → floor 180 ms (Legends); slow-mo bullet travel renders over 400 ms real time at 0.12× game speed; hit freeze-frame 80 ms; death-to-standoff 900 ms; wrong-way lean = hit (no partials — binary and honest).

## Toy check

Not a physics/sandbox concept — skipped. (Deaths are hand-keyed poses with tuned arcs, not simulated; no tuning-constant risk surface beyond the timing table above.)

## Mode

**Single-player**, leaderboard-wired (`POST /api/score`, metric: run bounty). Challenge convention: `?c=<bounty>` renders a "TARGET $X" wanted-poster ribbon during play. Party mode: explicitly out of scope for v1 (a 1v1 quick-draw is an obvious future Playroom fit — noted, not built).

## Art direction

**Spaghetti-western silhouette cinema.** Flat black figures against a hot gradient sky — Sergio Leone by way of a paper-cut theater.

**Palette (exact hexes):**
- Sky (top → horizon): `#FFD07B` → `#F18F01` → `#C73E1D`
- Noon-duel sky variant (rank 10): `#8C1D18` → `#C73E1D`
- Silhouettes (figures, cacti, buildings): `#2A1A14`
- Ground band: `#5C3A28`
- Bone/paper (UI, posters, text): `#FFF3E0`
- Muzzle flash / signal word: `#FFF8D6`
- Accent red (TARGET ribbon, foul stamp, El Mediodía's sash): `#B3271E`

**Shape language:** chunky, exaggerated silhouettes — hats 1.5× realistic size, bowed legs, long coats. Each slinger identifiable in pure silhouette (Sally's braid, Boone's flat parson hat, Vane's veil). Rounded-rect UI plates like weathered wood signs.

**Typography:** no engine defaults. Canvas-drawn heavy slab caps in a `Rockwell, 'Courier Bold', Georgia, serif` stack, double-struck (fill + 2px offset stroke) for a letterpress wanted-poster feel; wide letter-spacing on DRAW!, names, and bounties.

**Motion style:** anticipation-heavy 2–3 pose snaps with smear frames on the draw; slow-mo lean is the signature shot — letterbox bars slide in, bullet trails a `#FFF8D6` streak, dust hangs. Idle life: heat-shimmer on the horizon, a rolling tumbleweed, a circling crow.

## Sound & juice plan (event → channels)

| Event | Audio | Visual | Feel |
|---|---|---|---|
| Standoff | Wind + spur clink + accelerating heartbeat | Letterbox bars in, heat shimmer, fly buzz near hand | Rising dread |
| Fake twitch | Sharp spur *ching* | 2-frame hand jerk | Bait |
| Signal | Crow shriek / church bell (Boone) + word slam | **DRAW!** slams center, screen flash `#FFF8D6` | Release |
| Player fires | Layered crack + canyon echo | Muzzle flash lights silhouette rim, 80 ms freeze, 6 px shake | Power |
| Enemy hit | Comedic yelp + hat *pop* | Hat arcs, body 3-pose tumble, dust, bounty ticker rolls up | Reward |
| Out-drawn → slow-mo | Pitch-drop whoosh, heartbeat at 0.12× | Time dims, bullet streak, lean zones ghost in | The read |
| Successful lean | Bullet *zing* past ear | Camera nudge, bullet hole in saloon sign behind | Grazed glory |
| Player hit | Record-scratch sting | Flop tumble into trough, kill-cam tell flash 700 ms | Funny + lesson |
| Foul | Womp-womp two-note | Revolver juggles, **TOO EAGER** stamp in `#B3271E` | Shame → tension |
| Poster transition | Paper slap + trumpet sting | Next wanted poster slides in with taunt | One more |

Audio via **Howler** (pinned CDN) with tiny procedurally-generated/data-URI samples — no external asset fetches.

## Controls

**Desktop:** `SPACE` or left-click = draw/fire (and re-cock in exchanges). `←`/`A` = lean left, `→`/`D` = lean right. `R` = instant retry. Any FIRE input pre-signal = foul.

**Touch (landscape, letterboxed; portrait shows a rotate prompt):** context-modal, matching the two-input constraint — during standoff/draw, **tap anywhere = fire**; when out-drawn, slow-mo splits the screen into two glowing **LEAN zones** (left/right halves, labeled, ghosted in over 100 ms) and taps resolve as leans, never fires. Post-death, one big **AGAIN** button, thumb-reachable bottom-center. No score/UI in thumb zones during play.

## Rendering route

**Canvas2D, hand-rolled loop.** No physics, no camera, no particle load that needs Phaser — a fixed side-view stage with pose-swapped silhouettes and a handful of tweens. Fixed virtual resolution 1280×720, fit/letterbox scale per CONVENTIONS.md. Seeded RNG for signal delays and enemy behavior rolls (replayable challenges). Budget: well under 8 MB, playable <1 s.