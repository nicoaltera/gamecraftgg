# DESIGN_BRIEF — Wickwatch

**Premise (one line):** You are the keeper of Gull Rock Light — the fog is blind, your lamp can speak, and every ship out there only knows what you flash at it.

---

## Fun-drive dials (the load-bearing decision)

**Mastery 60 / Progression 25 / Spectacle 15.**
- **Mastery (primary):** the skill is *triage under a ticking language*. You get better at reading ship headings through fog, sequencing signals, and spending your beam-time on the ship that needs it most. Retries are instant and free.
- **Progression (secondary):** every ship you dock banks tonnage permanently into the run score before anything can go wrong — no run earns zero. The dawn tally after each night is the "banked something" beat.
- **Spectacle (garnish):** a wreck is content, not just a penalty — a slow, awful, watchable event (see Failure model). The fog/beam interplay is also a low-key light toy: sweeping the lamp through rolling fog banks is pleasing with zero goals.

Everything downstream (failure, escalation, judging) follows these dials: cheap honest retries, per-ship banking, wrecks-as-drama.

## Core verb (≤5 words)

**Flash morse to steer ships.**

One verb, two symbols. Aim the beam at a ship, then: **dot** (quick tap) = ship turns **28° to port**, **dash** (hold ≥250ms) = ship turns **28° to starboard**. That's the entire input language. Legible in 5 seconds: the first ship of Night 1 sails straight at a rock and a single ghosted hint shows `◦ tap = turn left`. Depth comes from consequences — turn a ship away from one rock and you've aimed it at the shipping lane of another; a dash costs you a quarter-second of beam-time you may not have.

## The twist (anti-samey)

This is not a lane-defense or a catcher. The twist is that **you never touch the ships — you only talk to them, in a two-word language, through a cone of light.** Control is indirect, delayed, and rationed: a ship only "hears" you while it's inside your beam cone *and* inside the fog-visibility ring, ships acknowledge each order with an echoed lantern flash before turning, and you have exactly one beam. Two ships converging on opposite sides of the rock is a sentence you physically cannot say fast enough unless you planned two seconds ago. The premise ("the lighthouse is the player character") carries the theme for free — no other game in the catalog controls by *signaling*.

Constraint mutated: not one button, but **one beam** — a single attention resource swept around a full circle.

## Failure model

Two of the three approved outcomes, stacked:

- **Failure-as-spectacle:** a ship that hits rock doesn't blink out. It groans (deep wood-crack), lists over ~1.5s, spills bobbing cargo crates and a spreading lantern-oil glow, and its silhouette stays wrecked on the rock for the rest of the night as a monument to your mistake. Losing is watchable.
- **Bank-every-attempt:** every docked ship's tonnage is scored the moment it crosses the harbor mouth. Three wrecks end the run, but the tally you built stands.
- **Instant retry:** game-over → one tap → Night 1 begins with the first ship inbound and the lamp cold in your hands. **Retry never auto-flashes, never auto-aims** — the player re-performs aim + signal from the true start state every time. No signal is ever sent on the player's behalf.

Boring failure is designed out: you always *see* the wreck coming (red hull-glow when a ship is <3s from rock), so death is a decision you failed to make, never a surprise.

## Structure & escalation

- **Session quantum:** nights of 60–90s; a full run (skilled) is 3–5 minutes. Dawn tally screen is the "one more" seam: *"Night 3 — 6 ships safe, 540 tons. Night 4: the fog is closing in…"* with the next night's threat named on the cliff.
- **Escalation as visible spectacle, not just numbers:**
  - Night 1–2: single ships, generous fog ring.
  - Night 3+: **convoys** (2–3 ships in file — one order steers only the ship you hit, the rest follow their doomed leader unless re-signaled).
  - Night 4+: **rolling fog banks** — visible gray masses that drift across the water and locally deaden your beam (ships inside them can't hear you until the bank passes). The threat is a *thing you watch move*, not a stat.
  - Night 6+: **storm gusts** — rain streaks cross the screen and visibly shove ships 10° off their acknowledged heading, forcing re-sends.
- **Risk/reward layer:** occasional **gold clippers** — fast ships worth 3× tonnage that always spawn on headings threading *between* rock clusters. Ignoring one is safe; guiding one means rapid-fire signaling while your slow freighters drift. Optional danger that pays.
- **Brag number:** **tons guided** — always visible top-center, ticking up the moment each ship docks. Secondary readout: night count.

## Toy check

Not a physics game (no simulation risk surface), but the beam itself passes the zero-goal test: rotating a warm volumetric cone through layered drifting fog, watching ship silhouettes resolve and dissolve, is amusing on its own. The attract screen literally lets you sweep the lamp before you press start.

## Mode

**Single-player**, global leaderboard on tons guided. Challenge param `?c=<score>` renders a `TARGET: <n> t` line under the score per the conventions.

## Art direction

- **Palette:** night water/sky `#081420` → `#0B1B2B` vertical wash; fog bands `#2E4756` at 25–45% alpha over `#93A8B4` haze; lamp beam `#FFD87A` core → `#FFB84D` edge, additive; ship hulls flat silhouette `#16242F` with a single lantern dot; acknowledgment flash `#7FE3C3`; rocks `#050B10` rimmed with foam `#E8F1F5`; imminent-wreck hull glow `#FF5A5A`; UI text `#E8F1F5`.
- **Shape language:** flat cut-paper silhouettes on 3 parallax layers (far haze, water + ships + rocks, near fog wisps). The beam is a long soft-edged triangle with a subtle grain texture; the lighthouse is a bold black silhouette anchored bottom-center (landscape) with a visibly rotating lamp head. No outlines, no gradients on objects — light does all the modeling.
- **Typography:** morse deserves monospace — `ui-monospace, "SF Mono", Menlo, "Cascadia Mono", monospace`, uppercase, +0.15em letter-spacing. Score ticks like a telegraph counter. No engine-default fonts anywhere.
- **Motion style:** slow and maritime. Ships ease into turns over ~0.8s (never snap); fog drifts perpetually; the beam sweep has 120ms of lag/inertia behind the pointer so it feels like machinery, not a cursor.

## Sound & juice plan (event → channels)

All audio synthesized with vanilla WebAudio (oscillators + noise + convolver) — no library needed, keeps the file self-contained.

| Event | Audio | Visual |
|---|---|---|
| Dot sent | short 880Hz tick | beam blooms bright for 80ms, lens flare ring |
| Dash sent | 350ms rising hum | beam holds bloom, charge ring fills while held |
| Ship acknowledges | distant single bell | `#7FE3C3` lantern blink on hull + tiny heading-arrow ghost showing its new course |
| Ship docks | warm harbor bell chord + rope creak | tonnage flies to the score counter, counter tick-rolls, small firework of gulls |
| Near-wreck (<3s) | low foghorn moan | hull pulses `#FF5A5A`, water churns white at the rock |
| Wreck | wood-crack + splash, then 1s of silence | slow list-over, crate spill, oil glow; screen does a 4px, 150ms shake — once |
| Dawn tally | swelling pad, gull cries | sky wash lightens, fog thins, tally counts up line by line |
| Ambient | continuous low surf + far foghorn every ~20s | perpetual fog drift, water shimmer |

Juice priority: the **acknowledgment blink** is the most load-bearing feedback in the game (it's how the player knows the language worked) — it must be unmissable even at the fog ring's edge.

## Controls

- **Desktop:** mouse position aims the beam (lamp rotates toward cursor with 120ms lag). Left-click tap (<250ms) = dot; click-hold (≥250ms, released or auto-fired at 350ms with a visible charge ring) = dash. No keyboard required; `Space` mirrors the mouse button for players who prefer aiming + keying separately.
- **Touch (landscape required):** touch anywhere on water — beam aims at the touch point continuously (drag to re-aim); release <250ms after touchdown = dot, hold ≥250ms = dash (same charge ring). Fingers never need to cover the lighthouse or the score strip; score sits top-center, out of both thumb zones. Minimum effective hit target is the beam cone itself (14° wide), not the ship sprite.
- **Orientation:** landscape only (the sea needs width).

## Tuning constants (explicit — this is the risk surface)

`beamConeHalfAngle: 7°` · `beamLag: 120ms` · `dotMaxHold: 250ms` · `dashFireAt: 350ms` · `turnPerSignal: 28°, eased 0.8s` · `fogVisibilityRadius: 46% of canvas height (Night 1), −4%/night, floor 30%` · `shipSpeed: 38px/s freighter, 66px/s clipper (at 1280×720 virtual res)` · `spawnCadence: every 9s Night 1 → every 5.5s by Night 6` · `wreckWarningLead: 3s` · `wrecksPerRun: 3` · `seeded RNG (mulberry32) for spawn headings/timings`.

## Rendering route

**Canvas2D.** No physics engine warranted — motion is kinematic (headings + eased turns), fog is layered alpha compositing, the beam is a gradient-filled path with `globalCompositeOperation: 'lighter'`. Fixed virtual resolution 1280×720 with the standard fit/letterbox scaler from CONVENTIONS.md. Well under the 400KB budget with zero external assets.