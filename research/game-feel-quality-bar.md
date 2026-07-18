# Research: What Makes Small Browser Games Elite (N, Heli Attack, Game Feel)

*Deep-research report, 2026-07-18. Findings ground `02-generation-pipeline.md` and `03-quality-rubric.md`.*

## 1. N (Metanet Software, 2004) — dissection

**Physics is the game.** Raigan Burns and Mare Sheppard set out to build "a 2D platformer in the old-school style, but with modern movement/collision." They originally planned a stealth game, but discovered in playtesting that "it was much more fun to run like crazy and jump all over the place" — and rebuilt the game around that discovery ([Gamecritics interview with Mare Sheppard](https://gamecritics.com/brad-gallaway/interview-with-metanets-mare-sheppard-co-creator-of-n/)). Key physics properties ([Wikipedia](https://en.wikipedia.org/wiki/N_(video_game))):
- **Additive momentum**: jumping adds velocity to existing momentum rather than resetting it, enabling chained maneuvers (wall-jump chains, ramp launches, slide-jumps).
- **Variable-gravity jump**: holding jump reduces gravity for floaty airtime; releasing restores full gravity for sharp descents — the player continuously sculpts their arc.
- **Terrain interaction**: curved/sloped tiles convert horizontal to vertical speed; walls allow climbing, sliding, and wall-jumps. Enemies are indestructible; the ninja's only weapon is movement.

**Structure**: 150 official levels in 30 **episodes of 5 single-screen rooms**. A **90-second timer covers the whole episode; each gold piece adds 2 seconds**, making gold simultaneously score, fuel, and optional risk — expert players route for gold, novices just survive. Death is instant (one hit, gibbed ragdoll) and restart is instant, to the start of the current room only.

**Community**: a built-in level editor fed NUMA (the "N User Map Archive"); Metanet integrated 50–100 community levels directly into official releases. Sheppard framed the minimalist vector art explicitly: graphics "serve to shift focus from the superficial 'window dressing'… good 'gameplay' is the essence of games." Their [N+ postmortem](https://www.gamedeveloper.com/business/n-beyond-the-postmortem) adds two hard lessons: they made **four full passes over all levels "flattening all the bumps in difficulty,"** and wall-jumping still needed an explicit tutorial. Their GDC 2016 talk ["Empowering the Player: Level Design in N++"](https://gdcvault.com/play/1023282/Empowering-the-Player-Level-Design) is about serving "complete noobs and 10-year veterans with the same level design" — every room has a survival path and a mastery path.

**Why it felt good**: a deep, consistent physics toy + tiny levels + zero-cost death = a mastery loop where every death teaches and retry costs nothing. The timer/gold economy turns the same level into both a survival puzzle and a speedrun.

## 2. Heli Attack 2/3 (squarecircleco, 2003–2005)

Run-and-gun **wave survival**: one soldier vs. escalating helicopter waves. Heli Attack 2 shipped **13 weapons** and 5 power-ups (jet pack, **time distort/slo-mo**, invincibility, TriDamage, predator mode); it won Miniclip Game of the Year 2003 and Flashkit's "Most Addictive Game" 2003 ([Codex Gamicus](https://gamicus.fandom.com/wiki/Heli_Attack_(series))). Heli Attack 3 added ~28 weapons, 16 levels each requiring N heli kills, then an **endless final level for score chasing** ([Jay Is Games review](https://jayisgames.com/review/heli-attack-3.php)).

**The replay loop, decomposed**:
1. **Weapon-pickup escalation as slot machine**: falling crates cycle you through an arsenal from pistol to railgun/A-bomb/black-hole generator; ammo is scarce so every pickup changes how you play *right now*. Novelty is delivered continuously without menus.
2. **Time distort** made the player feel superhuman (Matrix-era power fantasy) and doubled as a skill tool — dodging rockets in slow motion is inherently juicy.
3. **Score chase**: kill counters, combo-style escalation, and an endless mode with a visible high score; JIG comment threads show players grinding thousands of kills for personal records.
4. **Instant restart, single screen, zero narrative** — a full "run" is minutes, so "one more try" is frictionless.

## 3. Game feel / juice, concretely

**Steve Swink's definition** ([Game Feel](https://en.wikipedia.org/wiki/Game_feel)): *"real-time control of virtual objects in a simulated space, with interactions emphasized by polish."* Three pillars: (a) **real-time control** — the input→feedback correction cycle must close in **under ~100ms**; (b) **simulated space** — physics, gravity, weight, collision that give motion meaning; (c) **polish** — sight/sound effects that amplify the simulation.

**"Juice it or lose it"** (Martin Jonasson & Petri Purho, 2012, [video](https://www.youtube.com/watch?v=Fy0aCDmgnxg)): they take a gray Breakout clone and iteratively add: **tweened/eased entrances** (nothing pops in linearly), **squash-and-stretch on impact**, **ball trails**, **particles on every collision**, **screen shake on big hits**, **sound with pitch variation per hit**, **background color pulse**. Lesson: juice is cheap (screen shake is trivial to implement), multiplicative, and "maximum output for minimum input" — every player action should produce multiple simultaneous channels of feedback.

**Celeste's forgiveness mechanics** (Maddy Thorson, ["Celeste & Forgiveness"](https://maddymakesgames.com/articles/celeste_and_forgiveness/index.html)) — the canonical checklist of input-window fudging:
- **Coyote time** (~5 frames of jump grace after leaving a ledge)
- **Jump buffering** (early jump press fires on landing frame)
- **Half gravity at jump apex** while button held
- **Corner correction** (auto-nudge around clipped corners)
- **Wall-jump from 2px away** (super wall-jump ~5px)
- Principle: *"everything is fudged a tiny bit in the player's favor"* — hard game, kind controls.

**Restart speed** — Super Meat Boy's core design ([postmortem](https://www.gamedeveloper.com/audio/postmortem-team-meat-s-i-super-meat-boy-i-)): *"remove lives, reduce respawn time, keep the levels short and keep the goal always in sight."* Frustration, not difficulty, is what kills retention; death must be instant-retry (<1s, no dialog, no fade longer than ~300ms) and blame must land on the player, not the game.

## 4. Genre robustness for AI generation

**Robust** (deterministic win conditions, simple physics, no content-authoring bottleneck, quality is verifiable programmatically):
- **One-button / hypercasual** (Flappy-likes, timing games): the "three-second rule" — mechanic must be graspable on instinct in 3 seconds; sessions <60s decide churn.
- **Arena/wave survival** (Heli Attack, Vampire-Survivors-likes): difficulty = spawn-rate curve, a pure tunable function; escalation is parametric.
- **Endless runners**: procedural by construction; difficulty ramps via speed/spawn parameters.
- **Score-attack puzzle/arcade** (Breakout, snake, match): clear rules, machine-checkable states.
- **Momentum platformers with single-screen rooms** (N-likes): harder — physics tuning is the risk — but rooms are small enough to auto-solve/verify with a bot.
- **.io-style arenas** (vs. bots): simple rules + emergent risk/reward (grow = stronger but more vulnerable) generate depth for free; bot opponents substitute for multiplayer.

**Fragile**: narrative/adventure games (quality unverifiable, content-hungry), complex enemy AI (behavior bugs read as broken, not hard), simulation/strategy (balance explosion), anything multiplayer-dependent, precision level design at N++/Celeste tier (Metanet needed *four hand-tuning passes* and a decade of iteration — the top-tier of authored level design is the least automatable part). PCG literature (Togelius et al.) concentrates on roguelike/dungeon/arcade layouts precisely because those have generate-and-test loops with checkable constraints ([PCG via Generative AI survey](https://arxiv.org/html/2407.09013v1)).

## 5. Top 1% vs. mediocre 99%

The elite share: (1) one polished verb instead of five sloppy ones; (2) sub-100ms input response; (3) death → retry in under a second with progress-in-sight; (4) failure that is always readable and player-blamed; (5) a difficulty curve that ramps (waves, timer pressure, speed) rather than staying flat; (6) score/progress permanently visible, creating a self-set goal; (7) juice on every interaction (sound + particle + motion per event); (8) forgiveness fudging that makes controls feel psychic; (9) risk/reward layered on the base loop (N's gold, Heli Attack's exposed weapon crates, slither's growth trade-off); (10) skill ceiling far above the skill floor — the same level serves the noob and the veteran.

## The original 25-item verifiable checklist

*(Preserved as source material; adapted into agent-judged rubric form in `03-quality-rubric.md` per founder direction that verification be agentic, not deterministic.)*

**Responsiveness / feel**
1. Input-to-visible-response latency < 100ms (ideally next frame).
2. Stable 60fps; no frame > 33ms during normal play.
3. Player avatar accelerates/decelerates over multiple frames (no instant velocity snap) — tunable accel/friction constants exist.
4. If platformer: coyote time ≥ 4 frames implemented.
5. If platformer: jump buffering ≥ 4 frames implemented.
6. If platformer: variable jump height (release-to-cut or apex half-gravity).
7. Corner/edge forgiveness: near-miss collisions resolve in player's favor (nudge tolerance ≥ 2px).

**Death / retry loop**
8. Time from death to controllable retry < 1 second, zero clicks required (or one keypress).
9. No lives system / no punitive loss of more than ~60s of progress.
10. Death cause is visible on screen at moment of death (the killing object is rendered, distinct color, not off-screen).
11. Instant manual restart key exists (R or similar).

**Feedback / juice**
12. Every core interaction (hit, pickup, jump, death, score) fires ≥ 2 feedback channels (sound + particles/flash/shake).
13. Sound effects pitch-varied (±~10%) to avoid machine-gun repetition.
14. Screen shake and/or hit-stop (2–4 frames) on major impacts, amplitude-capped.
15. UI/objects enter with eased tweens, never teleport-pop (no linear/instant interpolation on spawns).
16. Score/progress counter always visible and animates when it changes.

**Structure / difficulty**
17. Playable within 3 seconds of load; core mechanic learnable by doing in first 10 seconds without text tutorial (or a one-line prompt max).
18. Measurable difficulty ramp: spawn rate / speed / enemy count strictly increases over a run (verifiable from the difficulty function).
19. First failure occurs after > 15s for a naive bot but a naive bot cannot survive > 90s (floor low, ceiling high).
20. A full session/run lasts 30s–3min — short enough for "one more try."
21. Win/lose conditions are programmatic and unambiguous (bot can detect game-over and score).
22. Risk/reward layer exists: an optional action that increases both score and danger (gold near hazards, exposed pickups).
23. High score persisted (localStorage) and shown on the game-over screen next to current score.
24. Game-over screen shows score + retry within 500ms; retry is the default focused action.
25. Auto-playability check: a scripted random/simple agent can complete the first level or survive first wave ≥ 50% of the time (proves fairness); an optimal-ish agent scores ≥ 5x the naive agent (proves depth).

**Key sources**: [N (Wikipedia)](https://en.wikipedia.org/wiki/N_(video_game)) · [Gamecritics Sheppard interview](https://gamecritics.com/brad-gallaway/interview-with-metanets-mare-sheppard-co-creator-of-n/) · [N+ postmortem, Game Developer](https://www.gamedeveloper.com/business/n-beyond-the-postmortem) · [GDC: Empowering the Player (N++)](https://gdcvault.com/play/1023282/Empowering-the-Player-Level-Design) · [Heli Attack series, Codex Gamicus](https://gamicus.fandom.com/wiki/Heli_Attack_(series)) · [Jay Is Games: Heli Attack 3](https://jayisgames.com/review/heli-attack-3.php) · [Game feel / Swink (Wikipedia)](https://en.wikipedia.org/wiki/Game_feel) · [Juice it or lose it (video)](https://www.youtube.com/watch?v=Fy0aCDmgnxg) · [Celeste & Forgiveness (Thorson)](https://maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · [Super Meat Boy postmortem](https://www.gamedeveloper.com/audio/postmortem-team-meat-s-i-super-meat-boy-i-) · [Slither.io design analysis](https://www.gamedeveloper.com/design/what-can-teach-us-slither-io-about-game-design-and-what-would-i-change-) · [PCG via Generative AI](https://arxiv.org/html/2407.09013v1) · hypercasual design guides ([gamedesignskills.com](https://gamedesignskills.com/game-design/casual/), [ejaw.net](https://ejaw.net/top-10-hyper-casual-mechanics/))
