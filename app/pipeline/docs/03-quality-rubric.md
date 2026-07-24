# 03 — Quality Rubric (agent-judged, archetype-conditional)

Derived from the full flash canon research (`research/top-flash-games-dna.md`, `research/launch-genre.md`, `research/physics-toys.md`, `research/game-feel-quality-bar.md`). **Enforcement is agentic:** LLM judges score each item from play-tester evidence (video frames, play report, console/perf data, code). No scripted assertions. Items marked ⛔ are **critical fails** — any one blocks publish regardless of total score.

**The rubric must never narrow the creative space.** The universal core applies to every game; beyond that, judges apply only the **archetype packs matching the design brief's declared fun-drive dials** (comedy/spectacle, mastery, progression — blends get multiple packs). A goalless toy, a one-click launcher, and a precision platformer are all first-class citizens; each is judged on *its own* promise. A game is never penalized for lacking another archetype's furniture (a toy needs no death loop; a launcher needs no difficulty ramp; a comedy game's floppy controls are a feature when the brief declares them).

**Publish gate: overall ≥ 80/100 AND zero critical fails.** (Minor critiques cost points; critical fails cap the score.)

## Judge panel

| Judge | Owns | Evidence emphasis |
|---|---|---|
| **Feel judge** | Universal core U1–U8 + mastery pack | frame-by-frame video, play report on responsiveness/retry |
| **Taste judge** | Universal core U9–U12, anti-samey, brief adherence | screenshots, palette/typography/motion vs DESIGN_BRIEF.md; recent-feed comparison |
| **Fun-drive judge** | the archetype pack(s) declared in the brief | naive vs skilled play sessions, emotional read of the play-tester's report |
| **Integration judge** | Universal core U13–U16 + platform contracts | score POST, challenge param render, touch controls, load/perf budget |
| **Content judge** | safety/IP/abuse screen | full playthrough + copy text |

## Universal core (every game)

**Works and responds**
- U1. ⛔ Game loads and is playable; no console errors that break play.
- U2. Input produces visible response within ~100ms (next-frame feel). *Deliberately awkward mappings (QWOP-style) are allowed when the brief declares comedy — the response itself must still be instant.*
- U3. Stable frame rate during normal play; no visible hitching; physics never explodes into NaN/offscreen chaos (wobble entertainingly, never break).
- U3a. ⛔ **Physics actually works — verified, not assumed.** If the game has simulated motion, a run must (1) reliably **terminate** — reach an end/goal/death; a run that can go forever with no resolution (fly-forever, never-lose, unbounded loop) is a critical fail; (2) be **winnable/completable** under reasonable skilled play — an unwinnable or impossible run is a critical fail; (3) be **forgiving enough to be fun** — not brittle/instant-fail or fighting the player; (4) never get **stuck/broken** (frozen, tunneled through geometry, NaN, launched to infinity). The play-tester must demonstrate a real run reaching an end state AND that the goal is achievable — tuning constants alone are not evidence. Treat physics as a thing to prove, not hope.

**Instantly legible**
- U4. ⛔ Core verb learnable by doing within ~10 seconds, no text-wall tutorial. One verb, describable in ≤5 words.
- U5. Time-to-fun: first meaningful interaction within seconds of load; no menus of substance before play.
- U5a. Controls are legible immediately (how to move + the primary action are shown in-world, desktop and touch — no guessing the movement keys), and any action the player performs repeatedly supports **hold-to-repeat**, never click-spam. (Single-shot / single-aimed actions may stay discrete — this applies to continuous/repeated actions.)
- U5c. **"Which one am I?"** If the player shares the screen with similar entities (bots/rivals/crowd/teammates), it is instantly and continuously obvious which avatar is theirs — a persistent distinct marker (unique color + a second cue like an outline/arrow/crown/"YOU" tag), called out at the start and never ambiguous mid-play. Color-only or spawn-only marking fails this. (N/A for single-avatar games.)
- U5b. **First-time clarity:** a new player understands the goal and every control they need on their first play — controls they can't discover by fiddling (charge, pitch, special, unlock) are shown by a simple in-world explainer scaled to the game's complexity (one line for one-button games; each control for multi-control games, revealed as it becomes relevant), minimal and self-dismissing, never a text wall. Interactive systems (shops/upgrades) state what each option does. The bar is "intuitive on the first try," not "figure-out-able." (A truly one-verb game satisfies this with a single hint.)

**Failure is never boring**
- U6. ⛔ Failure is cheap AND interesting per the brief's declared model: instant retry (mastery) / spectacle worth watching (comedy) / banked progress (progression). A failure that is slow, opaque, AND unrewarding is a critical fail regardless of archetype.
- U7. A full session unit is 30s–5min with a "one more" seam (the unit ends on a cliff or an adjacent reward).
- U8. One legible brag metric always visible (score, distance, depth, wave, days), animating on change.

**Interesting decisions (the "is it actually fun" gate)**
- U8a. ⛔ Retry returns the player to the real playable start state and the player performs the core mechanic themselves — no auto-executed core action (aim/charge/draw/throw) on replay. The play-tester must confirm a second play began from the same interactive state as the first.
- U8b. The core verb creates a live decision whose outcome the player earns: careless play and considered/skilled play produce visibly different results *through the player's choices*, not chance, and the optimal action is not a single obvious move repeated. A game that fails this is "lame" even with clean art and a novel premise — the fun-drive judge should say so plainly and score it down.

**Crafted, juicy, intentional**
- U9. Every core interaction fires ≥2 feedback channels (sound + particles/flash/shake/tween); sounds pitch-varied; nothing pops into existence without motion.
- U10. Escalation is delivered as visible spectacle (denser, bigger, further), not just hidden numbers.
- U11. **Art direction is cohesive and intentional** per the brief: specific palette, no engine-default fonts, consistent shape language. The game looks *designed*. Juice over fidelity — readable cartoon beats cluttered realism.
- U12. The game has its twist — not an undifferentiated clone of the archetype (taste judge sees short descriptions of recent published games).

**Platform integration**
- U13. ⛔ Touch controls work AND are self-evident — the play-tester completed a real session on mobile emulation; thumb zones don't occlude critical info; layout correct in declared orientation, letterboxed elsewhere. **CRITICAL: on a coarse pointer, every desktop action has a VISIBLE, LABELED on-screen control that a first-time player can see and use.** Judge from the mobile screenshots like a first-time player: for each thing the game lets you do, can you SEE how to do it on the phone? An action reachable only via an invisible drag zone, an un-drawn "left half = pitch" region, or a hint that has faded is a critical fail — the desktop control exists but the mobile player can't find it. Direct mappings (finger = aim/place) are ideal; analog drag controls must be drawn with a visible handle.
- U14. ⛔ Score reports correctly via the postMessage bridge (`parent.postMessage({ gs: 'gameover', score })` — games NEVER touch the network; the platform posts to the leaderboard); game-over/session-end screen shows score + best + retry (retry is the focused default); challenge param (`?c=`) renders a visible target during play. Party games: room join via link works for a second client.
- U15. Loads fast (<3s on normal connection, <8MB total); works in an incognito window.
- U16. Best score persisted locally; shown next to current score at session end.

## Archetype packs (apply only what the brief declares)

### Mastery pack (skill-chase, precision, dodge, arcade)
- M1. Death→controllable retry in under 1 second, zero or one input.
- M2. Death cause readable — the killing thing visible on screen at the moment of death; blame lands on the player ("honest difficulty").
- M3. Forgiveness fudging in the player's favor (coyote time / jump buffering / near-miss tolerance) where the verb calls for it.
- M4. Difficulty demonstrably ramps within a run (spawn rate / speed / complexity).
- M5. Depth window: naive play survives >~15s but can't coast past ~90s; skilled play scores dramatically better than button-mashing.
- M6. A risk/reward layer exists (optional danger that pays — gold near hazards, doubling bonuses, exposed pickups).

### Progression pack (launchers, upgrade loops, tycoon, digging, training)
*Keep progression simple and legible: the player should understand the whole ladder at a glance (rock → pistol → shotgun → machine gun). Complexity is not the source of the fun — the readable climb is.*
- P1. **Bank every attempt** — no run earns zero; failure converts to currency/progress. The player never goes backward.
- P2. The next upgrade/unlock is always visible and 1–3 runs away early on (adjacent-reward pacing).
- P3. Upgrades are visible and strategy-changing (new gear on the sprite, new physics behavior), not stat-only. Best tiers escalate in *kind* — a new form, material, or behavior the player sees change — not just a bigger number.
- P4. At least two simultaneous number-go-up axes (per-run score, cumulative currency, upgrade tiers).
- P5. Structure offers a personal-best chase and, where it fits, a finite completable goal graded on efficiency ("done in X days — think you can do better?"). Victory through persistence is guaranteed; only speed differentiates.
- P6. The upgrade arc has depth and a long tail: at least one upgrade is a tradeoff or interacts with another (not pure power); the ladder extends well past the completion goal toward a far, aspirational ceiling so mastery players keep climbing (not an empty wall after the obvious buys); and high tiers can introduce new capabilities, not just bigger numbers — while the first tiers stay cheap and one-more-run away.
- P7. Advancement is dramatically legible and earned: crossing a real milestone (age/tier/evolution/level) produces an unmistakable visual leap + a clear moment (never a subtle change the player might miss); and major milestones are paced to feel earned — accessible first steps, but big advances take real effort, not reached trivially fast. (Also, universal: when an entity's health/status drives the player's decisions, show it glanceably — e.g. health bars on combatants.)

### Comedy/spectacle pack (physics comedy, destruction, ragdoll, subversion)
- C1. Failure produces spectacle — the play-tester's report of a failed run should read as entertainment, not frustration (destruction/collapse/ragdoll payoff lands on losing runs too).
- C2. Outcomes are surprising even on similar inputs (chain reactions, variance) while remaining readable — the game is watchable; a stranger seeing 10 seconds would understand and smile.
- C3. If controls are deliberately imperfect, the floppiness reads as the joke (declared in brief), not as jank — and small mastery gains are still possible underneath.
- C4. Screenshot/clip-worthiness: the game reliably produces a moment worth sharing per session.

### Toy/sandbox pack (goalless or goal-light expressive systems)
- T1. The core interaction is fun with zero goals — fiddling is inherently amusing within 30 seconds (the Line Rider / Tower of Goo test).
- T2. Expressiveness: meaningfully different inputs produce visibly different outcomes; the player authors the outcome, the rules stay consistent.
- T3. A thin reward veneer (unlocks, currency, milestones) is present but never gates the toy itself.
- T4. If the toy produces an artifact (a track, a structure, a contraption), the session-end screen surfaces it as the shareable object alongside any score.

*(Party games layer the universal core + their declared pack; the room, not the archetype, is what U14 additionally verifies.)*

## Depth probes (play-tester protocol, conditioned)

- Mastery games: naive session then skilled session; verify the M5 window.
- Progression games: verify a 3-run opening session shows visible progress and an affordable upgrade (P1/P2), and that upgrades change the following run.
- Comedy/toys: play 5 varied sessions; verify variety of outcomes (C2/T2) and that the tester's narration contains at least one genuine "that was great" moment.
- All games: one full mobile-emulation session (U13) and one incognito load (U15).

## Calibration protocol

- **Golden set spans the archetypes:** hand-built passers — an N-like (mastery), a Heli-Attack-like (mastery/spectacle), a Learn-to-Fly-like launcher (progression), a QWOP-like or Crush-the-Castle-like (comedy/spectacle), a Line-Rider-like toy, and a party game — plus deliberate failers (no juice, boring failure, keyboard-only, broken score wiring, generic clone, physics that explodes). Every judge-prompt change re-runs the set; a passer failing or a failer passing blocks the change.
- Judges must justify each verdict with pointed evidence ("at 0:14 in the mobile run, the joystick overlapped the score") — unjustified verdicts are re-rolled.
- Log every verdict; sample-audit weekly against human taste. Judge drift is the silent killer.
