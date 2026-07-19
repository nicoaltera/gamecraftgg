# GameSight Game Conventions (the contract every game is judged against)

A GameSight game is **one self-contained `index.html`** served at `/play/<slug>/` and embedded in an iframe on its game page. No build step, no network requests, no external assets except the vendored libraries below. Everything else — art, sound, fonts — is generated in code (Canvas drawing, SVG data-URIs, WebAudio synthesis).

## Files

```
games/<slug>/
  index.html      # the entire game
  meta.json       # platform metadata (schema below)
  cover.svg       # 640×400 cover art, same visual language as the game
```

`meta.json`:
```json
{
  "title": "Paper Pilot",
  "slug": "paper-pilot",
  "description": "One-line premise a 12-year-old would repeat to a friend.",
  "verb": "throw the plane",
  "dials": ["progression", "comedy"],
  "orientation": "landscape",
  "mode": "sp",
  "scoreLabel": "m",
  "scoreOrder": "desc",
  "palette": ["#hex", "#hex"],
  "author": "gamesight"
}
```
`dials` ⊂ {mastery, progression, comedy, toy} — declares which rubric packs apply. `scoreOrder` is `desc` (higher better) or `asc` (lower better, e.g. fastest time). `scoreLabel` is the unit shown next to numbers.

## Allowed libraries (vendored, exact paths — nothing else, no CDNs)

- `/vendor/phaser.min.js` (Phaser 3.90, pinned) — classic script: `<script src="/vendor/phaser.min.js"></script>`
- `/vendor/three.module.min.js` (three.js, pinned) — ES module: `<script type="module">import * as THREE from '/vendor/three.module.min.js'</script>`
- Pure Canvas2D + WebAudio needs no library and is preferred for small games.

## Platform bridge (postMessage — games NEVER touch the network)

```js
// on load, once playable:
parent.postMessage({ gs: 'ready' }, '*');
// at every session end (death, run end, milestone for toys):
parent.postMessage({ gs: 'gameover', score: 1234 }, '*');
// optional, on live score change (throttle ≥ 250ms):
parent.postMessage({ gs: 'score', score: 1234 }, '*');
// if a challenge target was beaten this session:
parent.postMessage({ gs: 'challenge_beaten', score: 1234 }, '*');
```
The platform page handles leaderboard submission, player names, and share UI. The game handles its own game-over screen and **instant retry** internally — the platform never interrupts play.

## URL params the game must honor

- `?c=<int>` — challenge target. Render a persistent, styled "TARGET: <n>" during play; celebrate visibly when beaten (and post `challenge_beaten`).

## Local best score

Persist best score in `localStorage` under `gs_best:<slug>` (hardcode your slug). Show current + best on the game-over screen.

## Hard requirements (the rubric's critical fails — a game violating these does not ship)

1. Loads and is playable with zero console errors. Playable ≤3s after load on a normal machine; no menus before play (a single "tap/click or press any key to start" splash in the game's own art style is the maximum).
2. Core verb learnable by doing within 10 seconds. No text-wall tutorial — one short hint line max, shown in-world.
3. Failure is never boring: instant retry (≤1s, one input) AND/OR failure-as-spectacle AND/OR banked progress — per your declared dials.
4. **Touch works fully.** Pointer events (not click-only), thumb-zone-aware layout, controls documented in-world on touch devices. Test mentally at 390×844 portrait and 844×390 landscape.
5. Game-over screen: score + best + retry (retry is the default, triggered by tap/Enter/Space), rendered in the game's own art style.
6. **Retry returns to the real playable start state.** A replay puts the player exactly where a first-time player begins — including any aim / charge / place / draw / setup phase the core mechanic requires. Never auto-perform the core action for them on replay. If the verb is "throw", replay lets them pull-and-release again; it does not throw for them.

## Feel & craft requirements (scored, not optional in spirit)

- Fixed virtual resolution, uniform scale, letterboxed with a deliberate letterbox color; crisp on retina (scale canvas by devicePixelRatio).
- Input→response <100ms. Movement has acceleration character unless the design is grid/discrete.
- ≥2 feedback channels (sound + visual) on every core interaction; WebAudio synth with pitch variation (±10%); screen shake/hit-stop on big moments, amplitude-capped.
- Nothing pops in — spawns/UI ease in. Score always visible, animates on change.
- Escalation as visible spectacle. One brag metric. Session unit 30s–5min with a "one more" seam.
- A specific, intentional palette (declare it in meta.json) — no default-looking grays, no engine fonts; if you render text, use a font stack with character (e.g. `"Comic Neue", "Chalkboard SE", "Segoe Print", sans-serif` or draw your own).
- Deterministic RNG preferred: `mulberry32(seed)`-style seeded generator; never rely on `Math.random` for anything replay-relevant.

## Performance budget

<400KB per game excluding vendored libs; 60fps target; no per-frame allocations in hot loops; total memory sane on a phone.

## Party games (mode: "party", Phase 2)

Playroom Kit will be vendored when party mode ships; party games declare `"mode": "party"` and use the room contract (to be appended). Not used in Phase 1.
