# 04 — Site Design Language (strict; implementing agent follows exactly)

Founder direction, verbatim intent: **high taste, subtle front end, clean whites, feels hand-drawn — but tasteful.** This document is prescriptive. Do not substitute defaults. When in doubt, remove.

## Concept: the sketchbook

GameSight's chrome is a sheet of clean white paper, and every game is a drawing taped onto it. This is true to the product: games here are *drawn into existence* from a sentence, and the heritage is doodles in the margin of a school notebook — which is where flash games lived. The games themselves are colorful and loud; the site around them is quiet white paper and ink line work. **The chrome never competes with a game for color.**

## Tokens

### Color (site chrome only — games have their own per-game art direction)

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FCFCFA` | page ground everywhere. Clean white with a breath of warmth. Never cream, never gray panels |
| `ink` | `#1A1815` | all text, line work, icons, borders |
| `graphite` | `#6F6A61` | secondary text, captions, timestamps |
| `biro` | `#2447D6` | the single accent: links, primary buttons, focus rings, active states. Ballpoint-pen blue — the color you doodle with |
| `highlighter` | `#FFE94A` | scores, records, and challenge targets ONLY — applied as a marker-swipe behind the number (skewed rect, not a pill). If it appears anywhere else, it's wrong |
| `redpencil` | `#D9482B` | errors and destructive actions only |

Hard rules: no gradients, no glassmorphism, no colored panels, no dark mode in v1. Shadows only as "paper lift": `1px 2px 0 rgba(26,24,21,0.12)` on hover-raised cards — an offset print shadow, not a blur cloud.

### Typography

| Role | Face | Rules |
|---|---|---|
| Display | **Shantell Sans** (500–700) | wordmark, page titles, game titles, the challenge dare ("Beat 4,720"). Hand-drawn personality with real typographic craft. Used with restraint — if more than two display elements are visible per viewport, cut one |
| Body/UI | **Instrument Sans** (400/500) | everything else. Sentence case throughout |
| Scores/data | **IBM Plex Mono** (500, tabular) | scores, timers, leaderboard numbers, K-metrics. Numbers are sacred here; they always get mono |

Scale: 14/16/20/28/40/56px, line-height 1.5 body / 1.1 display. Never letterspace the display face.

### Line work (the signature)

The one memorable element: **hand-drawn ink framing.** Every game card and game canvas sits inside a slightly wobbly single-stroke ink frame (SVG path, 1.5–2px `ink`, wobble amplitude ~1.5px, like a rectangle drawn confidently by hand — NOT shaky). Corner radius comes from the wobble, never from `border-radius` on these frames. Standard UI (inputs, menus) uses clean 1px `ink` borders with 6px radius — the hand-drawn treatment is reserved for *games and dares*, so it stays special. Icons are single-stroke doodles (1.5px, round caps), consistent stroke weight across the whole set.

### Motion

- **Draw-in, not fade-in:** frames and underlines animate via SVG stroke (`stroke-dashoffset`), 250–400ms, ease-out — the page draws itself. Once per element per session; never on scroll-spam.
- **Hover boil:** primary interactive cards may swap between 2 pre-computed wobble paths at ~3fps while hovered (the hand-drawn "boil"). Hover only, primary elements only.
- Everything else is instant or ≤150ms. `prefers-reduced-motion`: all of the above becomes static.

## Layout

Generous white space is the aesthetic — the paper IS the design. 12-col grid, max-width 1200px, gutters ≥32px desktop.

```
┌────────────────────────────────────────────────┐
│  gamesight ✎        [play] [make]     ○ avatar │  ← thin header, wordmark in Shantell
│                                                │
│   What do you want to play into existence?     │  ← the prompt box is the hero:
│   ┌~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~┐     │    one hand-framed input, nothing else
│   └~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~┘     │    above the fold competes with it
│                                                │
│   HOT ─────────────────────────── new ↓        │
│   ┌~~~~~~~┐  ┌~~~~~~~┐  ┌~~~~~~~┐  ┌~~~~~~~┐  │  ← game cards: cover frame (game's own
│   │ cover │  │ cover │  │ cover │  │ cover │   │    colors) inside wobbly ink frame,
│   │       │  │       │  │       │  │       │   │    title in Shantell, plays in mono
│   └~~~~~~~┘  └~~~~~~~┘  └~~~~~~~┘  └~~~~~~~┘  │
└────────────────────────────────────────────────┘
```

- **Game page:** the canvas is the page — letterboxed on paper, hand-drawn frame, leaderboard as a simple ruled list (hairline `ink` rules) beside/below it. Challenge state shows the dare big in Shantell with a highlighter swipe on the number.
- **Build page (live theater):** agents' progress as a vertical notebook timeline — designer's brief appears as handwritten-style notes, the play-tester's live browser embedded in a hand frame, judge verdicts as short inked stamps (PASS in biro / a redpencil note). This page must be screenshot/screen-record beautiful; it's marketing.
- **Death/game-over overlay (inside game pages, platform-rendered):** score in mono with highlighter swipe, retry as the focused default, challenge link as a torn-paper ticket motif.

## Copy voice

Plain verbs, sentence case, dare energy. "Play", "Make a game", "Beat 4,720", "Send this to someone who talks trash." Buttons say what happens: "Publish" → toast "Published." Errors are direct and unapologetic: "That prompt broke our pencil. Try fewer ideas at once." Never say AI, model, agent, or generate in player-facing copy — games are *drawn*, *made*, *built*.

## Quality floor (unannounced, non-negotiable)

Responsive to 360px, visible `biro` focus rings on everything focusable, keyboard-navigable feed and game pages, reduced motion respected, real `<button>`/`<a>` semantics, OG cards for every game and every challenge link (cover + score in the sketchbook style — the link preview is a marketing surface).

## Anti-defaults checklist (reject the PR if any appear)

Cream `#F4F1EA` backgrounds · dark-mode-with-acid-accent · gradient hero text · glassmorphism cards · numbered 01/02/03 section markers · Inter-for-everything · uniform 12px-radius cards · blurry colored glow shadows · emoji as icons · center-aligned marketing prose blocks.
