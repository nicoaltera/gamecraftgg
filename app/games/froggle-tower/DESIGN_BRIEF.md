# DESIGN_BRIEF — Froggle Tower

**Prompt:** "a tiny wizard stacking runaway frogs into a tower before the moon sets"
**Slug:** `froggle-tower` · **Mode:** single-player (leaderboard) · **Renderer:** Phaser 3 + Matter (physics-heavy — see Rendering Route)

---

## 1. Fun-Drive Dials

**Blend: 55% comedy/spectacle · 35% mastery · 10% progression.**

- **Comedy/spectacle (primary):** the blocks are *alive and uncooperative*. Every landing squashes, every wobble croaks, and a topple is a fireworks show of shrieking frogs raining past the camera. Failure is content — the collapse is the funniest moment of the run, never a punishment screen.
- **Mastery (secondary):** placement is a real skill read — frog weight, squirm timing, tower lean, and when to spend a scarce Hush spell. Skilled players stack 20+; naive players get 6 and a great story.
- **Progression (garnish):** best-height ghost line ("YOUR BEST — 14") rendered inside the sky at that altitude, so every run visibly climbs toward a personal landmark. No meta-upgrades in v1.

Everything downstream (failure model, difficulty, judging emphasis) follows from comedy-first: judges should weight "was the collapse delightful?" as heavily as "was placement fair?"

## 2. Concept & Core Verb

**Core verb: "stack squirming frogs" (3 words).**

You are a thumb-sized wizard at the base of the screen. Frogs hop in from the sides; your levitation beam grabs the next one, you position it over the tower, and drop. Legible in 5 seconds: frog floats above tower, you release, it lands, tower wobbles, height number ticks up.

Depth comes from the verb's *consequences*, not new verbs: a frog is not a brick. After landing it sits still for a **patience window** (2.5–5s by species), then **wriggles** — a small impulse that shears the tower — and if left long enough at the top, it **leaps off entirely**. So the tower is a decaying structure you must out-build, and every placement is a bet on which frog fidgets next.

## 3. The Twist

**Living blocks under a real-time celestial clock.** This is not Tetris-with-a-skin and not a generic stacker:

1. **The blocks fight back.** Stacking games are usually about *your* error; here the tower misbehaves on its own schedule. The tension between "place the next frog" and "the third frog down is about to kick" is the whole game.
2. **The moon is the timer, the mana, and the mood.** A big cream moon crosses the sky over ~2.5 minutes. Moonlight recharges the wizard's one spell — **Hush** (a sleepy sparkle that pacifies one frog for 8s). As the moon sinks, recharge slows, the sky deepens, and the endgame becomes a desperate no-magic scramble. When the moon touches the horizon: run over, tower measured.
3. **Theme as multiplier:** "tiny wizard vs. an insubordinate amphibian civil-engineering project" is inherently meme-able. The wizard visibly *cares* — cheering little ✨ when a frog settles, hat drooping when one leaps.

## 4. Failure Model

**Failure-as-spectacle + instant zero-cost retry.** Two end states, both cheap and interesting:

- **Topple:** center of mass goes, tower shears, and we lean in — 0.4s slow-mo at the tipping point, ragdolling frogs bouncing off each other with a pitch-scattered croak chorus, the wizard's hat blown off, confetti of stars. Then a single button: **"RE-STACK"** — new run in <1s, same input (click/tap anywhere).
- **Moonset:** not a failure at all — the run *banks*. Height is scored, frogs yawn and pile into a sleepy heap, "THE FROGS SLEEP AT 17" card. This is the "one more" seam: the moon resets instantly and your best-height ghost line taunts you.

No run earns zero: even a 3-frog topple shows the counter you hit. Boring failure is designed out — every collapse is authored to be worth watching.

## 5. Structure & Escalation

- **Session quantum:** one moon = ~2 min 30 s max; typical topple runs 40–90s. "One more" seam at both endings.
- **Escalation by species, delivered as spectacle** (visible variety, not just harder numbers). Frog queue is seeded-RNG, species unlock by current height:
  - **H 0+ — Pond Frog:** medium, docile (patience ~5s). The tutorial block.
  - **H 4+ — Tree Frog:** tiny, light, patience ~2.5s, wriggles hard, may leap. Jittery comedy.
  - **H 8+ — Bullfrog:** huge and heavy — crushes wobble out of the frogs below (a stabilizer!) but is a wide, lean-inducing shelf. Landing gets a screen thump.
  - **H 12+ — Greased Frog:** shiny, low friction, slides off anything not near-flat. Pure slapstick.
- **Risk/reward layer:** occasionally a **Moon Moth** drifts across the upper sky. Nudge your held frog through it *before dropping* (a detour that risks a sloppy placement) → full Hush recharge + the frog lands pre-slept. Optional danger that pays.
- **Brag number:** **height in frogs**, huge and always visible top-center, ticking up with a squash-pop on every settled landing. Secondary flavor line at run end only ("tallest frog obelisk this moon: 23").
- **Camera:** follows the tower top; the base grows tiny below — height is *felt*, not just counted.

## 6. Toy Check (physics)

Passes. With zero goals, no timer, no counter — dropping squishy, croaking, fidgeting frogs onto each other and watching the pile misbehave is funny for minutes (the cat-stacking / Tower of Goo test). The moon and the height counter are garnish on a good toy.

**Physics tuning constants (explicit — this is the risk surface; builder must not eyeball these):**

| Constant | Value | Why |
|---|---|---|
| Gravity | 1.1 (Matter default ×1.1) | Drops feel weighty, not floaty |
| Frog restitution | 0.08 | Squish, don't bounce — bouncing reads as broken |
| Frog friction | 0.9 (Greased Frog: 0.15) | Frogs grip frogs; the slippery one is the exception that proves it |
| frictionAir | 0.02 | Damps jitter without looking like syrup |
| Angular damping (post-settle) | angularVelocity ×0.9/frame while "settled" | Kills micro-wobble accumulation between wriggles |
| Wriggle impulse | 0.012–0.03 × mass, random ±30° of horizontal, every patience-window expiry | Big enough to threaten, small enough to survive if the stack is clean |
| Leap impulse (top frog only) | 0.08 × mass at 60–75° | Rare, telegraphed by a 0.5s crouch — always visible coming |
| Settle threshold | speed < 0.15 for 20 frames → counts toward height | Prevents counting a frog mid-slide |
| Bodies | chamfered rectangles (radius 40% of half-height), not circles | Circles roll forever; chamfered boxes wobble charmingly then stop |

Frogs sleep (static-ish, high damping) when 3+ frogs are stacked above them — keeps the sim stable and the CPU flat at tall heights; only the top ~3 frogs are "live."

## 7. Mode

**Single-player, global leaderboard** on best height (`POST /api/score` per conventions; challenge param `?c=<height>` renders a "TARGET — <n> FROGS" dashed line in the sky at that altitude during play).

## 8. Art Direction

**Palette (dusk-to-moonset, cohesive night-storybook):**

- Sky gradient top → horizon: `#141034` → `#2B1E5C`, shifting toward `#3A1A4E` (dusky plum) as the moon sets
- Moon: `#F7E8B5` with `#FFF7DC` glow halo; horizon silhouette hills `#0C0A22`
- Frogs: Pond `#7BC950`, Tree `#A8E063`, Bullfrog `#4E9F3D`, Greased `#8FD6A8` (with `#FFFFFF` 40%-alpha sheen streak); all frogs get `#F9F5E3` bellies and dot eyes
- Wizard: robe `#6C4AB6`, hat `#4B2E9E` with `#FFD447` star; levitation beam `#B7A6FF` at 35% alpha
- Accents: firefly/star particles `#FFD447`; Hush sparkles `#CDE8FF`; UI text `#F9F5E3`
- **No placeholder gray anywhere; no engine-default font.**

**Shape language:** everything round and bean-like — frogs are squashed capsules with two bump-eyes, the wizard is a cone hat on a teardrop, the moon is geometry-perfect against wobbly organic hills. Flat fills + single darker outline tone per shape; no gradients on characters (sky only).

**Typography:** rounded chunky display for numbers/titles — "Fredoka" (or "Baloo 2") via Google Fonts CDN; fallback stack `"Fredoka", "Comic Sans MS", sans-serif` so it never renders default. Height counter is the typographic hero.

**Motion style:** squash-and-stretch on every land (scaleY 0.7 → overshoot 1.08 → 1.0 over ~180ms); frogs idle-breathe at ±2% scale; wizard hat tilts with tower lean (a free readability aid); camera eases, never snaps.

## 9. Sound & Juice Plan

Library: **Howler** (pinned per CONVENTIONS). All SFX procedurally generated or data-URI; croaks are one base sample pitch-shifted.

| Event | Audio | Visual juice |
|---|---|---|
| Frog grabbed by beam | soft harp pluck | beam brightens, frog dangles/kicks |
| Drop released | whistle-down (pitch ∝ fall distance) | motion streak |
| Landing (settled) | wet "gloop" + croak pitched by species; **croak pitch rises with tower height** (the tower becomes a chord) | squash-stretch, dust-star puff, height counter pops |
| Bullfrog landing | low thud | 3px/90ms screen shake (only shake in the game — reserved for weight) |
| Wriggle warning | quickening tick-croak 0.5s before impulse | frog flashes warm `#FFD447` rim — every threat is telegraphed |
| Hush cast | glissando chime | `#CDE8FF` sparkle drift, frog gets a nightcap, ZZZ particles |
| Moon Moth caught | bell arpeggio | mana ring flares full |
| Topple | slow-mo 0.4s: muffle audio, then croak-chorus glissando down + soft crash | frogs ragdoll, hat flies, star confetti |
| Moonset | hush + owl note | sky dims to plum, frogs yawn-pile, score card slides in |
| New best height | single triumphant "RIBBIT!" | ghost line shatters into fireflies |

Ambient: sparse cricket loop, volume ducking as the moon lowers (audible time pressure).

## 10. Controls

Sparse, high-leverage: **one positioning input + one drop + one optional spell.**

- **Desktop:** mouse X moves the held frog horizontally above the tower (beam follows); **click / Space** drops; **right-click / E** casts Hush on the frog nearest the cursor (cursor shows a moon-icon when Hush is ready). No keyboard-only movement needed, but ←/→ also nudge position for trackpad-haters.
- **Touch:** drag anywhere to slide the held frog (indirect drag — finger never occludes the tower); release to drop. Persistent **Hush button** bottom-right (thumb zone, 64px, shows recharge ring); tap it then tap a frog. Score counter top-center, clear of both thumb zones.
- **Orientation: portrait primary, landscape supported** (fixed virtual resolution + fit/letterbox per CONVENTIONS; portrait 720×1280 canvas — a tower game earns portrait).

## 11. Rendering Route

**Phaser 3 (pinned per CONVENTIONS) with Matter physics.** This concept is genuinely physics-heavy — the entire game *is* rigid-body stacking, lean, shear, and topple; hand-rolling stable stacking in canvas2d is a known tar pit and the wobble IS the content. Arcade physics is insufficient (no rotation/torque); Matter's compound chamfered bodies + the sleeping scheme in §6 keep it at 60fps with <20 live bodies. All art drawn procedurally (Graphics/generated textures); zero external assets; well under the 8MB / 3s budget.

## 12. Judge Notes

- **Feel:** landings must read weighty (restitution table above) and every wriggle/leap must be telegraphed — an untelegraphed topple is a fairness critical-fail.
- **Taste:** the collapse should be the best-looking moment in the game. If topples feel like punishment rather than a show, iterate there first.
- **Naive session target:** a first-time player should stack ≥5 frogs, laugh at least once at a topple, and immediately understand what the moon is doing.