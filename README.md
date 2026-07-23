# GameCraft ✎

**Games with your friends in 60 seconds.** Type a sentence → an agent pipeline designs, builds, play-tests, and judges a complete browser game → it publishes to a shareable URL. No downloads, no accounts to play. Dare a friend to beat your score.

**Live at [gamecraft.gg](https://gamecraft.gg).**

## How a game gets made

One prompt spawns a pipeline of agents ([`app/pipeline/run.mjs`](app/pipeline/run.mjs)):

```
prompt ─→ DESIGNER ─→ BUILDER ─→ PLAY-TESTER ─→ JUDGE ─┐
              ▲       (writes one self-contained        │ score ≥ 80,
              │        index.html, pure Canvas2D        │ no critical fails
              │        + WebAudio)                      │
              └── fix cycle (≤3) ←── critique ←─────────┘
                                                        └─→ published draft
```

- **Designer** writes a full design brief first — mechanics, fun-drive dials, art direction, controls — before any code.
- **Builder** implements it as **one self-contained `index.html`**: no build step, no network calls, art and sound generated in code. The contract is [`app/CONVENTIONS.md`](app/CONVENTIONS.md).
- **Play-tester** is a real headless Chromium harness that plays the game on desktop and mobile viewports and captures console errors, bridge messages, and screenshots.
- **Judge** scores against a strict [quality rubric](app/pipeline/docs/03-quality-rubric.md) — termination, winnability, feel, art direction — and either publishes or sends a critique back for a fix cycle.

**Every build runs on its own ephemeral machine.** The app dispatches each job to a fresh Fly Machine (auto-destroyed when done); the pipeline reports back through one seam — [`app/pipeline/reporter.mjs`](app/pipeline/reporter.mjs) → [`/api/internal/build/[id]`](app/app/api/internal/build/%5Bid%5D/route.ts) — with a per-job HMAC token. Workers hold no app secrets and can't touch the credit ledger; refunds happen app-side, and a reaper fails-and-refunds any build that goes silent. Deploys never interrupt in-flight builds. Locally, the same pipeline runs as a plain child process against SQLite — one code path, two reporter adapters.

Failed builds refund themselves. Judge-passed games are drafts until their creator hits Publish.

## Why the games are safe to play

Generated games are untrusted code. They run inside a sandboxed iframe on a **separate origin** (`play.gamecraft.gg`), isolated from the app by the same-origin policy, with a CSP that allows no network access at all (`connect-src 'none'`). Scores travel over `postMessage` only.

## Repo layout

| Path | What it is |
|---|---|
| [`app/`](app/) | The product: Next.js 16 app, SQLite, the agent pipeline, seed games |
| [`app/pipeline/`](app/pipeline/) | Generation pipeline + the rubric/guidance docs the agents read |
| [`app/games/`](app/games/) | Game library (each game = one folder: `index.html`, `cover.svg`, `meta.json`) |
| [`docs/`](docs/planning-README.md), [`research/`](research/) | The original design docs and deep-research reports the product is grounded in |

## Running it locally

```bash
cd app
npm install
npm run dev        # → http://localhost:3000
```

Playing the seed games needs nothing else. **Generating** games needs the [`claude` CLI](https://claude.com/claude-code) on `PATH` and these env vars in `app/.env.local`:

| Variable | Purpose |
|---|---|
| `BETTER_AUTH_SECRET` | session signing — `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | the pipeline's agents |
| `POLAR_*` | credit-pack checkout + webhook (optional locally; see [`app/lib/polar.ts`](app/lib/polar.ts)) |

Economics: creating a game costs 1000 credits, an edit 50; new accounts start with 2000. 100 credits = $1.

## Deploying

One Fly.io web machine + one volume + an ephemeral worker machine per build. [`app/Dockerfile`](app/Dockerfile) (Playwright base + claude CLI) and [`app/fly.toml`](app/fly.toml) describe the web app; workers are booted from the same image via the Machines API. The SQLite file and the game library live on the volume and survive deploys.

Fleet dials (all Fly secrets): `GC_DISPATCH=machines` turns the fleet on (omit for single-box local-spawn mode), `FLY_API_TOKEN` (a deploy token) lets the app boot workers, `GC_INTERNAL_SECRET` signs per-job worker tokens, `GC_MAX_CONCURRENT` / `GC_DAILY_CAP` bound parallel and daily builds, and `GS_MODEL_*` / `GS_EFFORT_*` pin each agent's model and reasoning effort per role.

## Design language

Hand-drawn sketchbook: paper whites, ink lines, wobble frames, biro-blue, highlighter-yellow for scores. The rules are strict and live in [`04-site-design-language.md`](04-site-design-language.md). Never branded as "AI games."

## Contributing

Issues and PRs are welcome — game ideas, pipeline improvements, bug reports. All merges go through the repo owner. Please don't submit games built outside the pipeline; the judge is the quality bar.

## License

[MIT](LICENSE)
