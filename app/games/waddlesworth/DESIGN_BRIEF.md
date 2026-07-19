# DESIGN_BRIEF — Waddlesworth Will Fly

**Premise (one line):** Waddlesworth the penguin is done with swimming. Strap on cardboard wings, hurl him off the colony cliff, and flap — badly, then gloriously — all the way to Puffin Rock, one magnificent crash at a time.

---

## Fun-drive dials

**Progression (primary) + Comedy (secondary).**
- *Progression:* every run banks fish (currency) — no run earns zero. The chase is the upgrade ladder and the next distance zone. Difficulty never spikes; the world gets farther, not meaner.
- *Comedy:* failure is the content. Crashes are ragdoll-tumble spectacle, and the watching penguin colony holds up score cards after every landing. Losing is a punchline, not a punishment.
- *What follows downstream:* judges should weight banked-progress integrity, crash entertainment value, and upgrade legibility over raw challenge. This is not a mastery-precision game — timing bonuses exist but are gravy.

**Anti-samey note for the catalog:** this is *not* a Learn-to-Fly clone and *not* Paper Pilot with feathers. In those, the launch is the skill and the flight is mostly watched. Here **the flight itself is played, every second** — a metered flap you actively ration — and the launch is just the opening beat.

## Concept & core verb

**Core verb (3 words): flap to fly.**
One button, context-sensitive:
- On the clifftop: **hold** = waddle-sprint down the ice slope; launch happens at the lip (release timing gives a bonus, see Controls).
- Airborne: **hold** = flap (climb, drains wing stamina), **release** = spread-wing glide (slow sink, stamina regenerates, speed carries).

Legible in 5 seconds: you hold, penguin flaps and rises, a wing-stamina gauge visibly drains; you release, he glides and the gauge refills. The entire game is *when to spend the wing*.

**The live decision (Law 1):** stamina is a metered resource, not a one-shot. Every moment asks: burn stamina now to climb toward that gull draft, or glide and save it for the whale spout ahead? Plus a constant spatial choice of lane — skim the sea (fish schools + whale-spout boosts, but water = splash-out) or fly the safe high line (slow, poor). Success is felt as earned rationing; running dry mid-climb is always the player's ledger, telegraphed by the gauge, wing droop, and a warning cluck. Nothing about the optimal move is constant: drafts, fish arcs, and spouts keep re-pricing the spend/save decision.

**Law 2 (player performs the mechanic):** retry always returns Waddlesworth to the clifftop with the slope ahead. The player holds to waddle and launches themselves, every single run. Nothing ever auto-launches or auto-flaps on their behalf.

## The twist

1. **Metered flapping is the game.** Not launch-and-watch: a hold-to-spend / release-to-recover wing economy makes mid-air the decision space (hold-to-consume beats tap-to-fire).
2. **The colony judges you.** After every crash, a row of deadpan penguins raises score cards (6.0 · 4.5 · 9.8 for a truly spectacular tumble). Style of failure is celebrated — the meme moment.
3. **Whale spouts are elevators.** Whales telegraph (shadow, bubbles), surface, and blow — ride the spout for a huge free lift. But spouts live at sea level, in splash range. Charming, physical, risk-priced.

## Failure model

**Bank-every-attempt + failure-as-spectacle** (per the dials — both boxes checked):
- Every run converts distance to fish (1 fish / 25 m) plus fish caught mid-air. No zero runs, ever.
- Crash = comedic multi-bounce tumble with snow poofs, slide-whistle, then the score-card ceremony. The ceremony is tap-skippable; **crash → back on the clifftop in ≤1s** for players who want to go again immediately.
- Splashing into the sea is the same ceremony with a soggy-penguin variant (colony holds up cards showing fish skeletons).

## Structure & escalation

- **Session quantum:** early runs 20–40s; late runs 2–4 min. Run end → fish tally counts up → "NEXT: Gull-Feather Wings — 7 more fish" teaser → shop (one screen, big buttons) or instant retry. That teaser is the "one more" seam.
- **Escalation as visible spectacle — distance zones the player sees change:** Colony Beach (0–400 m) → Open Sea with breaching whales (400–1,500 m) → Storm Belt, headwinds and rolling thunderheads (1,500–3,000 m) → Golden Dawn (3,000–5,000 m) → **Puffin Rock at 5,000 m — the story goal**, where the flying birds finally salute him → Jetstream → Aurora (20,000 m) → the stars → **the Moon at 250,000 m (aspirational ceiling; it is, per colony legend, made of krill)**.
- **Risk/reward layer:** the low lane — leaping fish schools and whale spouts hug the waves; skimming pays double but water kills the run. Storm clouds hide fish caches inside turbulence.
- **Brag number:** distance (m), top-center, always visible, animates on change. Best distance persisted (`gs_best:waddlesworth`).
- **Progression (depth levers, deliberately simple and glanceable):**
  - Upgrades escalate in *kind* — visible transformations: Flipper Tape (10 🐟) → **Gull-Feather Wings** (25, new look, less sink) → Krill Bars (40, stamina max) → Fish-Oil Ramp Wax (60, launch speed) → **Waxed Canvas Wings** (100, new look, less drag) → *tradeoff pair:* Big Lungs (bigger stamina tank) **vs** Storm Flippers (stronger flap, drains faster) at 150 each — order matters, both eventually ownable → Aviator Goggles (220, glide speed retention + style) → Herring Magnet (300, pickup radius) → **Rocket Herring (450) — unlocks a genuinely new capability: a second button, hold-to-burn boost with its own per-run fuel meter** (a second metered resource) → Foil Wings (700, new look) → Whale Whisperer → Storm Rider (headwinds become tailwinds — sight gag) → Rocket Herring Mk II → space-tier absurdities scaling toward the Moon.
  - First tiers are one-run-away; the tail is long and generous — Puffin Rock resolves the story around tier ~9, the remaining ladder is the flex.
  - Save under `gs_save:waddlesworth`; platform "start over" resets cleanly.

## Toy check (physics game — must amuse with zero goals)

Passes: a heavy, round, over-committed penguin with swoopy glide physics, bouncy crashes, and whale-spout elevators is funny to just *fly around with*, no goals attached. Distance and fish are garnish on the toy.

**Tuning constants (the risk surface — explicit, tune from these):**
- Virtual resolution 960×540. Gravity **1,400 px/s²**.
- Flap (held): upward accel **2,600 px/s²**; stamina 100 max, drains **40/s**, regens **18/s** gliding, +25 instant per fish eaten.
- Glide (released): lift proportional to airspeed; drag coefficient **0.05**; flap-state drag **0.12**. Pull-out of a fast sink retains **85%** of speed → the satisfying swoop emerges.
- Waddle: accel **300 px/s²**, max sprint **420 px/s**; perfect lip release (±80 ms window) = **+15%** launch speed, "PERFECT WADDLE!" + 60 ms hit-stop.
- Crash bounces: restitution **0.45**, tangential friction **0.82**, 2–4 tumbling bounces with rotation, snow poof per bounce.
- Whale spout: **+700 px/s** vertical over 0.5 s; telegraphed 1.5 s ahead (shadow + bubbles).
- Seeded RNG (mulberry32) for fish arcs, whale timings, drafts — replay-relevant randomness is deterministic per run seed.

## Mode

**Single-player** (`sp`). Two leaderboards per conventions: primary = fewest flights to reach Puffin Rock (efficiency-to-goal, `asc`); challenge board = best single-flight distance (`desc`) — that's what `?c=` targets. Post per-board map at session end; only send `migration` on the run that reaches the Rock.

## Art direction

- **Palette:** Ice White `#F7FBFD` (snow, belly) · Glacier Teal `#A5E3EF` (day sky) · Dawn Peach `#FFD9A0` (horizon glow) · Deep Sea Ink `#0E3A4C` (sea, UI text, letterbox color) · Penguin Slate `#26343E` · Beak Orange `#F49B33` · Coral Pop `#FF6B57` (UI accent, score cards) · Fish Gold `#FFC94D` (currency sparkle). Sky lerps through zones: teal → storm slate → peach dawn → aurora greens → star-field ink `#131B3A`.
- **Shape language:** everything rounded — Waddlesworth is a capsule with a teardrop belly; ice is blobby; clouds are circle clusters. No outlines; flat fills with one darker shade tone per shape. The only sharp shape in the game is his beak.
- **Typography:** no engine fonts — stack `"Chalkboard SE", "Comic Neue", "Segoe Print", sans-serif`, chunky and hand-drawn in feel; big numerals for distance.
- **Motion:** squash/stretch on every flap and landing; ease-back on UI; camera leads ahead of velocity, pulls back with speed; nothing pops in — fish arc in, whales rise, cards flip up one by one.

## Sound & juice plan (WebAudio synth, ±10% pitch variation everywhere)

| Event | Audio | Visual |
|---|---|---|
| Flap (each beat) | filtered-noise whoosh, cadence-locked | wing squash, feather flecks |
| Airspeed | wind loop, lowpass + volume map to velocity | speed lines >600 px/s |
| Fish catch | rising sine blip, pitch climbs with streak | gold sparkle burst, +🐟 float, counter tick |
| Whale spout | deep whoosh + jolly two-note hum | screen shake (capped), spray particles |
| Perfect Waddle | bright triad | 60 ms hit-stop, flash ring at the lip |
| Stall warning | worried cluck | stamina bar flash, wings droop |
| Crash bounces | slide-whistle down → thud per bounce | snow poofs, tumble rotation, capped shake |
| Score cards | wooden tick per card, ding on total | cards flip up sequentially, deadpan blink |
| Purchase / transform | cha-ching arpeggio / short fanfare | Waddlesworth visibly re-costumed on the spot |

Every core interaction has ≥2 channels. Score animates on change; fish tally counts up at run end.

## Controls

- **Orientation:** landscape (letterboxed 960×540, letterbox `#0E3A4C`, DPR-crisp).
- **Desktop:** hold **Space / left mouse / any arrow** — waddle on ground, flap in air; release to glide. **X or Shift** = Rocket Herring burn once owned. `preventDefault()` on all consumed keys; `window.focus()` on first pointer interaction.
- **Touch:** hold anywhere on screen to waddle/flap; release to glide. When Rocket Herring is owned, a right-thumb-zone boost button eases in (left-hand hold + right-thumb boost). HUD (distance top-center, stamina bottom-left arc around Waddlesworth, fish top-right) clears both thumb zones.
- **In-world hint (fades once demonstrated):** "HOLD to flap · release to glide" written in the snow at the cliff; touch shows a pulsing hold-circle.
- One primary input is the design — sparse and high-leverage; the second button is an earned late-game unlock, not a launch requirement.

## Rendering route

**Canvas2D + WebAudio, no library.** Hand-rolled point physics (one body + fake tumble on crash — rotation and squash, not true multi-segment ragdoll) is well within Canvas2D; Phaser earns nothing here. Single self-contained `index.html`, all art drawn procedurally, <400 KB, 60 fps, no per-frame allocations in the flight loop. Honors `?c=<int>` with a styled "TARGET: n m" banner + `challenge_beaten` post; standard `ready` / `gameover` / throttled `score` bridge messages.