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

### Leaderboards — match the metric to the goal

Pick your board(s) from what the game is actually about. An **endless** game ranks its endless metric (`scoreLabel`/`scoreOrder` as above). A game with a **completable goal** should rank efficiency-to-goal (fewest attempts / fastest time), not raw distance — "reached it in 40 throws" beats "flew 2000m". When both an endless chase and a completion exist, declare **two boards**:

```json
"boards": [
  { "key": "delivery", "label": "throws", "order": "asc", "primary": true },
  { "key": "distance", "label": "m", "order": "desc", "challenge": true }
]
```

- `primary` = the headline leaderboard. `challenge` = the board the "dare a friend" link uses (default: primary — but point it at an endless per-run metric if the primary is a cross-session completion stat).
- With `boards` declared, post a per-board map at session end:
  ```js
  parent.postMessage({ gs: 'gameover', scores: { distance: 2169, delivery: 40 } }, '*');
  ```
  Only include a board's value when this session produced it (e.g. only send `delivery` on the run that reaches the goal). A single-board game may keep posting `{ gs: 'gameover', score: N }`.

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

## Controls must be clear and feel right

- **Legible immediately.** Show how to MOVE and how to perform the PRIMARY ACTION in-world (a brief on-screen prompt / control hint), on both desktop and touch. A player should never have to guess the movement keys (e.g. surface "WASD / arrows to move · hold to shoot"). Fade the hint after the player demonstrably gets it.
- **Hold-to-repeat for continuous actions.** If an action is meant to be performed repeatedly or continuously (firing, throwing, building, digging), holding the input must auto-repeat it at the action's natural cadence — never force the player to spam clicks/taps. (One-shot or single-aimed actions can stay discrete; this is only about actions the player does over and over.)
- **Show entity state that drives decisions.** When an entity's health/status affects the player's choices (enemies and rivals in combat, units, bosses, competitors), make it glanceable — a small health bar / status pip above or on the entity — so the player can read the situation at a glance and decide. (Skip it where state doesn't matter to decisions; don't clutter.)
- **Make advancement unmistakable.** When the player levels up / advances an age / evolves a tier, show a clear, big change (a real visual leap + a brief flourish), not a subtle one — the player should never wonder whether they advanced.
- **Make it unmistakable which one is the player.** In any game where the player shares the screen with similar-looking entities (rivals, bots, a crowd, competitors, teammates), it must be instantly and continuously obvious which one is *theirs* — a persistent, distinct marker they can't miss: a unique color plus a second cue (a bold outline, a bobbing arrow, a crown, a "YOU" tag), called out clearly the moment play starts (e.g. a brief "you're the red one" / spotlight on your avatar) and never ambiguous mid-action. Relying on color alone, or only marking them at spawn, isn't enough. (Single-avatar games with one obvious character don't need this.)
- **First-time clarity — a new player is never confused.** They must understand the GOAL and every control they need on their first play. "Learnable by doing" only covers controls a player can actually discover by fiddling; anything they can't (a charge-throw, a pitch key, a special weapon, an unlock) must be shown with a simple, in-world explainer. **Scale it to complexity:** a one-button game needs a single line; a game with several distinct controls should briefly name each one, and can reveal advanced controls when they first become relevant (e.g. show the pitch keys once airborne, the special once unlocked) rather than dumping everything at once. Keep it minimal, delightful, and self-dismissing (fades once used / after a beat) — never a text wall or a blocking menu. And make interactive systems self-explaining: a shop/upgrade option states plainly what it does. The bar is "intuitive and delightful on the first try," not "figure-out-able."

## Keyboard

Call `e.preventDefault()` on every key your game consumes (arrows, space, etc.) in your `keydown` handler so the browser never scrolls or page-jumps during play. The platform also focuses the game iframe on load/hover and guards page scroll on game-control keys, but preventing default in-game is required hygiene. On load, `window.focus()` in response to the first pointer interaction is a good extra safeguard (especially if you `preventDefault` on `pointerdown`, which can otherwise suppress focus).

## URL params the game must honor

- `?c=<int>` — challenge target. Render a persistent, styled "TARGET: <n>" during play; celebrate visibly when beaten (and post `challenge_beaten`).

## Local best score

Persist best score in `localStorage` under `gs_best:<slug>` (hardcode your slug). Show current + best on the game-over screen. Persist any progression save under a slug-scoped key too (e.g. `gs_save:<slug>`) — the platform's "start over" control wipes every localStorage key containing the game's slug and reloads, so slug-keyed saves reset cleanly without touching other games. (Optionally also handle a `{gs:'reset'}` postMessage to reset in-memory state for a separate game origin.)

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
