# DESIGN_BRIEF — STANDSTILL
*Slug: `standstill-firefight` · Single-player · Canvas2D · Landscape*

## One-line pitch
A stick-figure gunfight where time is your throttle: the world only moves as fast as you do — stand still and every bullet hangs in the air, sprint and the whole arena erupts at full speed.

## Fun-drive dials
- **Mastery — 60%.** The joy is threading a frozen lattice of bullets and getting visibly better at it. Death is always your fault and always legible (you watched that bullet the whole way). Retry is instant and zero-cost.
- **Comedy/spectacle — 30%.** Stick figures ragdoll extravagantly, ink splats on the paper, your own death plays out as a 1.2s slow-mo flop into a pile of limbs. Failure is content.
- **Progression — 10%.** In-run only: a legible weapon-steal ladder (pistol → shotgun → SMG → sniper) that mirrors the enemy escalation. No meta-currency; the chase is score.

Everything downstream follows: failure model is instant-retry + spectacle, difficulty is honest (all threats telegraphed and visible in freeze), judges should weight dodge legibility and time-scale feel above all.

## Core verb (≤5 words)
**Move to make time move.**

Legible in 5 seconds: the opening frame is three enemies with laser sights and one bullet already frozen mid-air in front of your face, with the words **"TIME MOVES WHEN YOU MOVE"** inked across the paper. The text and the bullet only advance when the player's first input lands. No tutorial beyond this; the rule teaches itself.

## The twist (why this isn't a generic SUPERHOT clone)
Three mutations, all downstream of taking the creator's rule *literally and analog*:

1. **Time is analog, not binary.** `timeScale = clamp(playerSpeed / maxSpeed, 0, 1)`. Creeping at half-stick gives you half-speed bullet-time; sprinting is realtime. Speed itself becomes a metered resource you ration — every step you take advances every bullet on screen. Standing dead still is a true freeze (timeScale = 0).
2. **Your own bullets obey the rule too.** When you fire, your bullet freezes with everything else. You must *walk your kill into the target* while enemy bullets advance in lockstep. Shooting is a commitment, not a resolution — the interesting decision happens *after* the trigger pull.
3. **Shooting costs time.** Each shot force-advances the world by a fixed 120ms burst (recoil-in-time), so you can't stand frozen and free-fire. Attacking from safety is impossible by rule, not by tuning.

The decision loop this creates is live every single beat: *do I spend motion to deliver my bullet, knowing the same motion delivers theirs?* The optimal move is never obvious and never repeatable — it depends on the exact bullet lattice around you. This is the interesting-decisions-under-pressure law satisfied structurally, not decoratively.

## Failure model
- **Instant zero-cost retry (mastery):** one hit kills you; death → 1.2s slow-mo ragdoll → "AGAIN" prompt; any input restarts a fresh run at Wave 1 with your pistol, standing still, time frozen, waiting on *your* first move. The player performs the mechanic every time — retry never auto-starts time and never skips the standstill opening.
- **Failure-as-spectacle (comedy):** your stick figure crumples via verlet ragdoll, the killing bullet's full path replays as a red ink line across the arena, and the death screen shows the wave that was waiting: *"Wave 6 never saw you."* Losing is a shareable image.
- Boring failure is designed out: every death is traceable to one visible bullet the player chose not to respect.

## Structure & escalation
- **Session quantum:** a run is 1–4 minutes. Waves of 3–8 enemies in a single-screen arena; clearing a wave triggers a 1.5s ink-wash transition into a new layout with the next wave badge stamped huge on the paper — that stamp is the "one more" seam.
- **Escalation as visible spectacle, one glance-readable ladder:**
  - W1–2: pistol grunts (single telegraphed shots)
  - W3: duelists spawn flanking — the choice of *which* threat to face first becomes spatial
  - W4: shotgunners (frozen fans of 5 pellets — beautiful and terrifying to thread)
  - W6: SMG sprayers (curtains of bullets; the lattice gets dense)
  - W8+: snipers — near-instant shot, long red laser telegraph; density keeps climbing
- **Weapon steal loop:** enemies drop their gun where they ragdoll. Walking over it swaps your weapon (ammo is per-gun and stingy: pistol 6, shotgun 3, SMG 18, sniper 2). Empty gun? **Throw it** (stuns one enemy, comedic bonk) — the throw also obeys time rules. Dropped guns land *near where enemies died*, i.e., near danger: that's the risk/reward layer.
- **Graze bonus:** passing within one body-width of a live bullet chimes and bumps a score multiplier (×1 → ×5, resets on getting hit — it never resets on playing safe, only capping). Rewards threading tight instead of circling wide.
- **Brag number:** **SCORE** (kills × graze multiplier), top-center at all times, huge on death screen. Wave badge secondary, top-right. Challenge param `?c=<score>` renders a "TARGET" line under the score during play per conventions.

## Toy check
Not a physics-sandbox game, but the freeze itself passes the toy test: standing inside a frozen constellation of bullets, leaning the stick a few percent to watch the whole world breathe forward and back, is amusing with zero goals. Ragdolls are verlet stick-chains (6 segments per figure) — cheap, hand-rolled, no engine.
**Tuning constants (the risk surface, explicit):** maxSpeed 320 px/s · timeScale = clamp(speed/320, 0, 1) · shot time-burst 120ms · bullet speed 260 px/s (world-time) · sniper 900 px/s · graze radius 22px · ragdoll gravity 900 px/s², damping 0.98, ground restitution 0.25 · hit-stop 90ms real-time on kills.

## Mode
Single-player, leaderboard-wired (score POST per conventions). Party mode is a natural sequel but out of scope now.

## Art direction
Ink-on-paper stick-fight, high contrast, nothing gray, nothing default.
- **Palette:** paper `#F6F1E7` · ink black (player, arena lines, HUD) `#1B1B22` · enemy red `#E23B45` · bullet/muzzle amber `#F5A623` · graze/time-UI teal `#2EC4B6`. Blood is enemy-red ink splats that persist on the paper for the whole run — the arena becomes a record of the fight.
- **Shape language:** hand-inked stick figures with slightly wobbly 3px strokes (per-frame 1px jitter at low timeScale sells "hand-drawn"); round joint dots; guns are chunky 2-shape silhouettes. Arena walls are torn-paper edges, not straight rects.
- **Typography:** heavy grotesque caps — `900 'Archivo Black', 'Arial Black', sans-serif` — letterspaced, stamped at a −2° tilt like a rubber stamp. HUD text drawn on canvas with the ink color. No engine-default font anywhere.
- **Motion style:** smear-frames on fast limbs, long amber tracers on every bullet (trail length scales *inversely* with timeScale, so frozen bullets wear their full future path faintly — this is also the fairness mechanism), ink-wash wipes between waves.

## Sound & juice plan
All audio through Howler with a master `playbackRate` tied to timeScale — the entire soundscape stretches and pitches down as you slow, which *is* the game-feel of the mechanic. Procedural/data-URI SFX, no external assets.
- **Fire:** dry snap + 120ms time-burst whoosh; screen kick 3px opposite aim.
- **Kill:** 90ms hit-stop, ragdoll clatter (3 randomized knocks), ink-splat bloom, +score popup drifting up.
- **Graze:** glass chime rising in pitch per multiplier step; teal ring pulse on the player.
- **Near-freeze ambience:** low paper-rustle drone that fades in below timeScale 0.15 — stillness has a sound.
- **Death:** all audio tails smear down an octave; single sub thump; silence before "AGAIN".
- **Wave clear:** stamp thunk + wash swish.

## Controls
- **Desktop:** WASD/arrows move (analog feel via 150ms accel ramp — time eases in, never snaps), mouse aims, LMB fires, F or RMB throws empty gun. R = instant retry.
- **Touch (required, landscape):** left-half floating virtual stick moves — **stick deflection magnitude directly drives timeScale**, which makes the core mechanic *more* expressive on touch, not less. Right-half touch aims (drag to sweep), release fires; dedicated THROW button bottom-right appears only when the gun is empty. Thumb zones verified clear of score HUD.
- Aiming alone advances nothing; only movement and firing spend time — identical rule on both inputs.

## Rendering route
**Canvas2D.** No physics engine needed — kinematic bullets, hand-rolled verlet ragdolls, single fixed virtual resolution 1280×720 with fit/letterbox scaling per CONVENTIONS.md. Well under perf budget; target 60fps with ~200 live bullets + 8 ragdolls.