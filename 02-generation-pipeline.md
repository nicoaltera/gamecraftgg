# 02 — Generation Pipeline (the agentic core)

Founder's core requirement: **agentic verification, not deterministic tests.** Agents are in the loop at runtime — designing, building, playing, and judging each game as it is created. The quality bar in `03-quality-rubric.md` is enforced by LLM judges reasoning over play evidence, never by scripted assertions.

## Pipeline stages

```
PROMPT
  │
  ▼
DESIGNER AGENT ──(if ambiguous: 2-3 quick clarifying Qs to creator, skippable)
  │  writes DESIGN_BRIEF.md — high taste, opinionated
  ▼
BUILDER AGENT ── writes self-contained index.html against brief + CONVENTIONS.md
  │
  ▼
VERIFY LOOP (agents, at runtime, until pass or cycle budget)
  ├─ PLAY-TESTER AGENT — actually plays it (desktop + mobile emulation), captures evidence
  ├─ JUDGE PANEL — feel judge · taste judge · fairness judge · integration judge · content judge
  └─ fail → structured critique → BUILDER fixes → re-verify
  ▼
PUBLISH → CDN + URL + leaderboard/challenge wiring + feed entry
```

## Stage 1 — Designer agent (heavy planning, high taste)

Runs before any code. Produces `DESIGN_BRIEF.md`. The designer's job is to make a *specific, opinionated* game — not to funnel every prompt into a precision-skill archetype. The creative space is the whole flash canon (see `research/top-flash-games-dna.md`, `research/launch-genre.md`, `research/physics-toys.md`), not any two games.

**Two universal design laws (apply to every game, every archetype — do not skip):**

- **Interesting decisions under pressure.** The core verb must put the player in front of a live, legible decision where their skill or judgment visibly changes the outcome. Interrogate the loop honestly before building: *if the optimal move is obvious and simply repeated, or if success and failure feel arbitrary rather than earned, the game is lame — no matter how novel or charming the premise.* Fun comes from tension, expression, and outcomes the player feels responsible for; a fresh theme cannot rescue a hollow verb. This is the single most common failure of a generated game and the judges weight it heavily.
- **The player performs the mechanic every time.** Retry / play-again returns the player to the real playable start state — including any aim, charge, place, or draw phase the verb requires — and never auto-executes the core action on their behalf. A replay that does the interesting part *for* the player quietly deletes the game. (This is also a build-contract requirement; see `CONVENTIONS.md`.)

**Depth levers (tools, not requirements — reach for the ones that fit the verb; a pure reflex, toy, or comedy game may use none, and forcing all of them at once bloats a game).** When a game feels thin, these are the reliable ways to add depth without adding verbs:

- **Meter a resource instead of granting a one-shot.** An ability the player *rations* moment-to-moment — a boost that drains a gauge while held and only recovers when released, a light that burns fuel, a limited charge to place — creates a live spend-now-vs-conserve decision on every use. The same ability as a free or one-tap action usually has far less depth. (Hold-to-consume beats tap-to-fire when you want strategy.)
- **Make upgrades tradeoffs and transformations, not stat bumps.** Progression lands hardest when tiers escalate in *kind* — a new visible form, material, or behavior the player can see change (a paper plane becoming a foil jet; a fan becoming a rocket) — and when at least some upgrades introduce a tradeoff or interact with each other (more thrust burns fuel faster; a bigger tank vs. a stronger engine) rather than being pure power. Build the arc toward an earned peak upgrade, not an empty wall after the first few.
- **Give the player a choice of where/when to act** among competing options (which threat to clear, which route to take, which pickup is worth the risk) so the decision is spatial/temporal, not just timing.

These deepen a verb; they never replace the two laws above.

- **Fun-drive dials (the load-bearing decision):** research across the top-22 flash games shows three orthogonal drives — **comedy/spectacle** (fun = what happens on screen; failure is content — Happy Wheels, QWOP, Crush the Castle), **mastery** (fun = getting better; cheap honest retries — Meat Boy, Helicopter Game, Winterbells), and **progression** (fun = numbers going up; every run banks something — Motherload, Learn to Fly, Duck Life). The brief declares a blend (hybrids are the strongest performers) and everything downstream — failure model, difficulty, judging — follows from it.
- **Concept & core verb:** one verb, describable in ≤5 words, legible within 5 seconds of play. Depth comes from the verb's *consequences*, not from more verbs.
- **The twist:** what makes this game not the generic archetype (anti-samey requirement; freeform feeds converge on ~15 clones without this — `research/competitive-landscape.md` §3). Theme is a free multiplier — a specific, absurd, or charming premise ("penguin declares war on iceberg") does the work of narrative and meme-ability at once. Constraint breeds identity: mutate the constraint (one button, one lane, four keys), not the asset count.
- **Failure model (per the dials):** failure must be cheap AND interesting — pick at least one: instant zero-cost retry (mastery), failure-as-spectacle where losing is entertaining (comedy — deliberate floppiness/destruction counts), or bank-every-attempt where no run earns zero (progression: launch→earn→upgrade loops guarantee victory through persistence). Boring failure is the only forbidden outcome.
- **Structure & escalation:** session quantum 30s–5min with a "one more" seam (run/wave/level/day ends on a cliff). Escalation delivered as *visible spectacle* (bigger pops, denser waves, further flights), not just harder numbers. A risk/reward layer where it fits (optional danger that pays — gold near hazards, exposed pickups, doubling bonuses). One legible brag number, always visible (score, distance, depth, wave, days).
- **Toy check:** if the concept is physics/sandbox-flavored, the core interaction must be amusing with zero goals (the Line Rider / Tower of Goo test) — goals are garnish on a good toy. Physics is free content: chain reactions, wobble, collapse, and ragdolls generate authored-feeling drama from a few rules; tuning constants (restitution, damping, gravity) are the risk surface and get explicit values in the brief.
- **Mode:** single-player (leaderboard) or party (≤8, Playroom) — declared here, wired later
- **Art direction:** palette (specific hexes), shape language, typography, motion style. No engine-default fonts, no placeholder gray. Cohesion over detail — readable cartoon/minimalist aesthetics beat cluttered realism (juice over fidelity).
- **Sound & juice plan:** which events get which feedback channels (see rubric) — juice decides who wins; Crush the Castle vs Angry Birds proves mechanics are copyable and presentation captures the value
- **Controls:** desktop mapping + touch mapping (touch is required; declare portrait/landscape/both). Sparse high-leverage inputs are a legitimate design (one aimed launch + one optional mid-air button beats complex controls for casual players).
- **Rendering route:** Phaser 3 (2D, default) or three.js (3D — only when the concept genuinely needs it; 3D multiplies failure modes)

**Clarification:** if the prompt is ambiguous on mode, feel, or vibe, the designer asks the creator 2–3 quick multiple-choice questions before writing the brief. Skippable; defaults must be excellent.

## Stage 2 — Builder agent

Writes **one self-contained `index.html`** (inline JS/CSS; assets generated as code/SVG/data-URIs or drawn procedurally). No platform SDK. Constraints:

- **Pinned CDN whitelist** only: Phaser 3.x (exact pinned version), three.js (exact pinned rXXX), Playroom Kit, one sound library (Howler or Tone). Pinning matters: LLM training data is version-skewed (Phaser 4 shipped Apr 2026 but corpora are Phaser 3; see `research/framework-infra.md` §1).
- **`CONVENTIONS.md` injected into context** — the contract the judges enforce. Contents: the full quality rubric; keyboard+touch input requirement with virtual joystick/button patterns; fixed virtual resolution + fit/letterbox scaling snippet; score-POST contract (`POST /api/score` with per-game key); challenge-param convention (`?c=<score>` → render "TARGET" during play); Playroom room contract for party mode; performance budget (<8MB total, playable <3s, 60fps target); seeded-RNG preference.
- Implements the brief, not its own ideas. Brief drift is a judge-visible failure.

## Stage 3 — Verify loop (agents at runtime)

- **Play-tester agent** drives a real browser (Playwright/CDP): desktop viewport with keyboard, then mobile emulation with touch events. It plays the game for real — multiple sessions, naive then skilled play — and captures video frames, console errors, load timing, and a written play report ("I died at 22s to a rocket I could see coming; retry was instant; on mobile the left thumb zone blocked the score display").
- **Judge panel** scores the rubric from that evidence (see `03-quality-rubric.md` for the split of judges and critical-fail rules). Judges see: the design brief, the play-tester's video frames + report, the code, and load/perf numbers. They emit per-item verdicts, an overall score, and a structured critique.
- **Iteration:** fail → critique goes back to the builder → fix → re-verify. **Cycle budget: 4 full verify cycles per generation** (tune after Phase 0 cost benchmark). Exhausted budget → game is not published; creator sees the critique and can re-prompt.
- **Golden-set calibration:** before launch, hand-build reference games spanning the archetypes (mastery, progression launcher, comedy/spectacle, toy, party — see `03-quality-rubric.md` calibration protocol) that must pass, and deliberately broken/bland ones that must fail. Re-run on every judge-prompt change. Judge drift is a silent product-killer.

## Multi-turn editing

An edit prompt re-enters at the designer stage (brief gets amended, not rewritten), then build+verify runs again on the same slug. Previous version stays live until the new one passes — **regressions never ship**, which fixes the "prompt roulette breaks working games" failure every competitor has.

## Cost model

Cost of goods per published game = designer + builder + (play-tester + judges) × cycles. This is the number that decides viability — benchmark it in Phase 0 before building the site (see `06-roadmap.md`). Levers: cycle budget, judge panel size, model tier per role (cheap models for play narration, strong models for taste/feel judging), daily quota.
