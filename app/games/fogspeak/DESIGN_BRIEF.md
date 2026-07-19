# DESIGN_BRIEF — Fogspeak

**Prompt:** "a lighthouse keeper flashing morse code to guide ships through fog"

## Premise (one line)
You are the lamp. Ships are blind in the fog, and the only words you have are short flash and long flash — talk them home or watch them splinter on the rocks.

## Fun-drive dials
**Mastery (primary) + comedy/spectacle (secondary).**
- *Mastery:* the skill curve is signal precision under triage pressure — clean dot/dash timing, aimed at the right ship, at the right moment. Retries are instant and zero-cost; every wreck is legibly your fault ("I sent a dash when I meant a dot").
- *Comedy/spectacle:* failure is content. A wreck is a slow, theatrical catastrophe — the ship groans, keels, sheds crates and a flailing sailor, and lets out one long mournful foghorn. Losing a ship should make the player laugh before they wince.
- No progression dial: nothing banks between nights. The night itself is the unit of mastery.

## Concept & core verb
**Core verb (≤5 words): "flash coded light at ships."**
One input does everything: *where* you press aims the beam, *how long* you press speaks. Short press = **dot** (ship turns 30° to port). Long press = **dash** (ship turns 30° to starboard). A ship only hears you while your beam is on it. Depth comes entirely from the verb's consequences — turn commands are committed, ships keep sailing while you're busy talking to someone else, and every flash you spend on one ship is attention stolen from another.

Legibility in 5 seconds: night one opens with a single ship, a dotted "safe channel" ghost-line to harbor, and a two-line overlay — "TAP = ◦ turn left · HOLD = — turn right". The first ship acknowledges your flash by echoing it back with its stern lantern, teaching the vocabulary through feedback, not text.

## The twist (anti-samey)
**The lamp is both your eyes and your voice, and they compete.** Fog fully occludes the sea; ships are only visible inside your beam cone (plus a brief ripple + foghorn bleat when an unseen ship wants attention). Sweeping to *scout* and dwelling to *command* spend the same resource — your one cone of light. This turns a rhythm game into an attention-economy game: the interesting decision is never "can I tap a rhythm," it's "which of these three invisible ships do I trust to sail straight while I go talk to the one drifting toward the shoals?" No launcher, no runner, no stacker — a triage game played through a language of two words.

**Interesting-decisions audit (honest):** the optimal move is *not* obvious and *not* repeated — each moment is a live read of bearings, speeds, and rock proximity, and a wrong read produces a wreck the player saw themselves cause. Success is earned (a threaded three-ship night feels like conducting); failure is authored by the player's own routing, never RNG. Ships never spawn on unavoidable collision courses (spawn validator guarantees a solvable line for every ship at spawn time).

## Failure model
- **Wreck = spectacle, not run-death.** A wrecked ship plays its full comedy beat (~2.5s) while the night continues. Three wrecks end the night.
- **Night end → instant retry.** One tap/keypress restarts to the *true* start state: lamp idle at neutral bearing, first ship approaching, no signal pre-fired, no auto-aim. The player performs aim-and-flash from scratch every time — replay never executes the verb for them.
- Boring failure is designed out: you either got a shipwreck show or a "so close" harbor miss you can immediately re-attempt.

## Structure & escalation
- **Session quantum:** one night = 90–150 seconds. Night ends on a cliff: the horizon bell rings, tomorrow's manifest slides up ("NIGHT 4 — 6 ships · storm · the ferry is coming") — that manifest is the "one more" seam.
- **Escalation as visible spectacle, not just numbers:** more simultaneous ships (1 → 5), thicker fog (beam reach visibly shortens), drifting rock banks, then *storm nights* where lightning strobes the whole sea for one free frame of perfect information — a gift that doubles as a jump-scare when it reveals how wrong your mental map was. Later: the wide slow ferry (needs two commands to finish a turn) and the drunk trawler (overshoots every turn by 10°).
- **Risk/reward layer:** gold-lit *cargo ships* deliberately spawn on lines that hug the rocks — worth 3× a normal ship, and every extra flash spent on one is time the rest of the convoy sails unwatched. Occasional **SOS ship**: it flashes `· · ·` at you; answer with the same three dots (dot-dot-dot, your only three-symbol "word") to score a dramatic rescue worth 5×.
- **Brag number:** **SHIPS SAVED** (cumulative across the run's nights), always visible top-center in the lamp's brass counter. Wrecks tick a small skull tally beside it.

## Toy check
The core interaction passes the zero-goal test: dragging a warm volumetric beam through layered drifting fog — revealing water glitter, gull silhouettes, and half-seen hulls — is pleasant with nothing to do at all, like playing with a flashlight in the dark. Ships and scoring are garnish on that toy. Fog is 3 parallax alpha layers (drift 4/7/11 px/s); beam is an additive-blended cone with soft falloff; these are the feel-critical constants: beam half-angle **11°**, beam reach **62%** of screen width (shrinking to 44% by night 6), ship speed **28 px/s** base, turn animation **0.9s** ease-out per 30° command, dot threshold **< 220ms** press, dash **≥ 220ms**, beam sweep follow speed **240°/s** (snappy but perceptibly swept, never teleporting).

## Mode
**Single-player**, leaderboard (`scoreOrder: desc` on ships saved). Challenge param `?c=<score>` renders "TARGET n ships" under the brass counter per conventions.

## Art direction
- **Palette:** ink night sea `#0A1522` · deep hull silhouette `#16283B` · fog wash `#8FA6BC` (layered at 12–28% alpha) · lamp beam core `#FFE9A8` · beam glow / brass fittings `#F2B950` · harbor light green `#37D69B` · wreck & danger red `#D9472B` · lightning white `#EAF4FF`.
- **Shape language:** bold flat silhouettes — the lighthouse is a black paper-cut tower on the right edge; ships are simple two-tone hulls with one triangular sail or a boxy funnel; rocks are jagged low polygons. Zero outlines; everything reads by value contrast against fog. Cartoon proportions (stubby ships, oversized lamp).
- **Typography:** drawn/HUD text in `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` — maritime logbook character, no engine-default fonts. Score digits rendered in a brass-plate lozenge.
- **Motion style:** everything eases; nothing snaps except lightning. Slow fog drift, gentle ship bob (±2px sine), beam sweep with 120ms ease, wrecks keel over in exaggerated slow-motion.

## Sound & juice plan (synthesized via vendored Tone.js — no asset files)
| Event | Audio | Visual juice |
|---|---|---|
| Dot / dash | Warm click + filtered hum burst (dash sustains) | Beam flares +30% brightness for the press duration; lamp lens glints |
| Ship acknowledges | Two-note wooden bell echoing your pattern | Stern lantern blinks your exact signal back; tiny hull dip |
| Unseen ship calling | Low foghorn bleat, panned to its bearing | Concentric ripple rings pierce the fog at its position |
| Ship saved | Rising three-note harbor chime (pitch climbs with streak) | Green harbor light blooms; ship toots; +1 flips on brass counter |
| Wreck | Crunch + splash + long sad foghorn | Slow keel-over, crates & one flailing sailor bob away, 6px screen shake, skull tick |
| SOS answered | Triumphant horn chord | Golden flare, "S·O·S" spelled in light above the ship, 5× tag |
| Storm lightning | Thunder crack (delayed by distance) | One-frame full-sea reveal, then darkness snaps back |
| Night end | Horizon bell | Manifest card slides up on rope pulleys |

## Controls
- **Desktop:** mouse position aims the beam continuously (lamp sweeps toward cursor bearing at 240°/s); **left-click press duration** = dot/dash. Keyboard fallback: ←/→ or A/D sweep the beam, SPACE press duration = dot/dash. R = retry at night end.
- **Touch (landscape, required):** touch anywhere — beam sweeps toward the touch point; **press duration at that point** = dot/dash. One finger does everything; no virtual buttons, no thumb-zone HUD conflicts (brass counter is top-center, safe from both thumbs). A faint press-duration ring fills around the finger and ticks over at the 220ms dot/dash boundary so the threshold is visible, not guessed.
- **Orientation:** landscape only.

## Rendering route
**Canvas 2D.** No rigid-body physics — motion is kinematic (headings, easings, sine bob), and the feel-critical effects (alpha fog layers, additive beam glow, silhouette shapes) are exactly what raw canvas does cheaply. Phaser would add weight for nothing. Seeded `mulberry32` RNG for spawn tables and rock layouts (replay/challenge-relevant); fits <400KB trivially. Fixed virtual resolution with letterbox scaling per CONVENTIONS.md; score POST to `/api/score` with the per-game key.