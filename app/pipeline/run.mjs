// GameCraft generation pipeline (pipeline/docs/02-generation-pipeline.md).
//   Local/CLI mode:  node pipeline/run.mjs --prompt "a game about ..." [--id <id>] [--ref <ref>] [--edit <slug>]
//   Fleet mode:      node pipeline/run.mjs --job <generationId>   (GC_REPORT_URL + GC_JOB_TOKEN in env)
// Requires the `claude` CLI (Claude Code) on PATH. Agents in the loop:
//   designer -> builder -> [play-tester harness + judge] x cycles -> publish
// ALL side effects (trace, status, publish, refund) go through the Reporter —
// this file never touches the DB or the ledger directly. See reporter.mjs.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createReporter } from './reporter.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MAX_CYCLES = 3;
const PASS_SCORE = 80;

// ---------- args & reporter ----------
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const jobId = arg('job');            // fleet mode: fetch the job over HTTP
const jobLocalId = arg('job-local'); // app-dispatched on this box: job from the DB row
const remote = !!jobId;
const genId = jobId ?? jobLocalId ?? arg('id') ?? crypto.randomBytes(8).toString('hex');
if (!remote && !jobLocalId && !arg('prompt')) {
  console.error('usage: node pipeline/run.mjs --prompt "..." [--id <id>] [--ref <ref>] [--edit <slug>]  |  --job <id>  |  --job-local <id>');
  process.exit(2);
}

const R = await createReporter({
  remote,
  genId,
  fromDb: !!jobLocalId,
  prompt: arg('prompt'),
  ref: arg('ref') ?? '',
  editSlug: arg('edit') ?? '',
});
const job = await R.getJob();
const prompt = job.prompt;
const creatorRef = job.ref ?? '';   // owner of the resulting game
const editSlug = job.editSlug ?? ''; // if set, iterate an existing game in place
const GAMES_DIR = R.gamesDir();

function trace(kind, detail, stream) {
  R.trace(kind, detail, stream);
  console.log(`[${kind}${stream ? '/' + stream : ''}] ${String(detail).slice(0, 160)}`);
}
const setGen = (fields) => void R.set(fields);

if (remote && process.env.FLY_MACHINE_ID) {
  trace('worker', `worker ${process.env.FLY_MACHINE_ID} picked up the job (${process.env.FLY_REGION ?? '?'})`);
}

// ---------- agent spend (the input to credit pricing) ----------
// Every `claude -p` run ends with a `result` event carrying total_cost_usd and
// token usage, so the CLI does the price math for us. We accumulate per phase
// because the phase breakdown is what tells us which stage to make cheaper.
const _cost = { total: 0, calls: 0, byPhase: {}, tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, models: {} };
let _cycles = 0;
function recordCost(phase, ev) {
  const usd = typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : 0;
  const u = ev.usage ?? {};
  _cost.total += usd;
  _cost.calls += 1;
  const p = (_cost.byPhase[phase] ??= { usd: 0, calls: 0 });
  p.usd += usd;
  p.calls += 1;
  _cost.tokens.in += u.input_tokens ?? 0;
  _cost.tokens.out += u.output_tokens ?? 0;
  _cost.tokens.cacheRead += u.cache_read_input_tokens ?? 0;
  _cost.tokens.cacheWrite += u.cache_creation_input_tokens ?? 0;
  for (const m of Object.keys(ev.modelUsage ?? {})) _cost.models[m] = (_cost.models[m] ?? 0) + 1;
  setGen({ cost: JSON.stringify(_cost) });
  trace(phase, `spend: $${usd.toFixed(3)} (run total $${_cost.total.toFixed(2)})`, 'tool');
}

// ---------- claude helper (streaming) ----------
// Streams the agent's turns so the build page shows every thinking step, tool
// call, and message live — instead of hanging on one blocking call. Returns the
// concatenated assistant text for parsing. `cwd` sets the judge's working dir to
// the game folder for convenience, but is NOT a security boundary — Read can
// still take absolute/`../` paths. The creator prompt is untrusted, so PRODUCTION
// must run this pipeline inside the sandboxed build-worker container from
// 05-architecture.md (filesystem-isolated), not on a host with app secrets.
// TODO(prod): sandbox the judge; until then treat generation as trusted-operator.
function short(s, n = 150) {
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n) + '…' : one;
}
// Cost per game is dominated by model choice, so pin it per role rather than
// inheriting whatever the CLI defaults to (that default is not stable, which
// makes spend unpredictable in production). Override per role via env.
const MODELS = {
  designer: process.env.GS_MODEL_DESIGNER || 'claude-opus-4-8',
  builder: process.env.GS_MODEL_BUILDER || 'claude-opus-4-8',
  judge: process.env.GS_MODEL_JUDGE || 'claude-opus-4-8',
};
// Reasoning effort per role (founder-set 2026-07-23): the builder writes the
// game — full effort; designer briefs and judge scoring hold quality at medium
// with meaningfully less latency. Override per role via env.
const EFFORT = {
  designer: process.env.GS_EFFORT_DESIGNER || 'medium',
  builder: process.env.GS_EFFORT_BUILDER || 'high',
  judge: process.env.GS_EFFORT_JUDGE || 'medium',
};

function claude(rolePrompt, { tools, timeoutMin = 15, cwd = APP, phase = 'agent' } = {}) {
  return new Promise((resolve, reject) => {
    const cliArgs = ['-p', rolePrompt, '--output-format', 'stream-json', '--verbose'];
    if (MODELS[phase]) cliArgs.push('--model', MODELS[phase]);
    if (EFFORT[phase]) cliArgs.push('--effort', EFFORT[phase]);
    if (tools) cliArgs.push('--allowedTools', tools, '--permission-mode', 'acceptEdits');
    const child = spawn('claude', cliArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    let fullText = '';
    let buf = '';
    let stderr = '';
    const timer = setTimeout(() => {
      trace(phase, `timed out after ${timeoutMin} min — moving on`, 'tool');
      child.kill('SIGKILL');
    }, timeoutMin * 60 * 1000);

    function handleEvent(ev) {
      if (!ev || typeof ev !== 'object') return;
      if (ev.type === 'result') recordCost(phase, ev);
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const b of ev.message.content) {
          if (b.type === 'text' && b.text) {
            fullText += b.text;
            trace(phase, short(b.text, 220), 'say');
          } else if (b.type === 'thinking' && b.thinking) {
            trace(phase, short(b.thinking, 220), 'thinking');
          } else if (b.type === 'tool_use') {
            const inp = b.input ? short(JSON.stringify(b.input), 120) : '';
            trace(phase, `${b.name} ${inp}`, 'tool');
          }
        }
      } else if (ev.type === 'result' && typeof ev.result === 'string' && !fullText) {
        fullText = ev.result; // fallback if no assistant text blocks were seen
      }
    }

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue; // non-JSON line from the CLI — ignore
        }
        // NOT inside the parse try: a bug in our own handler must surface, not
        // masquerade as an unparseable line.
        handleEvent(parsed);
      }
    });
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`claude spawn failed: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      void R.set({}); // nudge a flush so the tail of this agent's stream lands
      if (fullText) resolve(fullText);
      else reject(new Error(`claude exited ${code} with no output${stderr ? ': ' + short(stderr, 300) : ''}`));
    });
  });
}

function extractBlock(text, lang) {
  const re = new RegExp('```' + lang + '\\s*\\n([\\s\\S]*?)\\n```');
  const m = text.match(re);
  return m ? m[1] : null;
}
function extractJson(text) {
  const block = extractBlock(text, 'json');
  if (block) return JSON.parse(block);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error('no JSON found in agent output');
}

// These live INSIDE the app tree (pipeline/docs) — the Docker build context is
// the app folder, so a parent-relative path would be missing in production
// (which is exactly how the first prod run died). And they load inside the try:
// any startup crash must reach the catch, which marks the generation failed
// and refunds the debit — a pre-try crash strands a paid 'running' row.
let conventions, rubric, designGuidance;

try {
  conventions = fs.readFileSync(path.join(APP, 'CONVENTIONS.md'), 'utf8');
  rubric = fs.readFileSync(path.join(APP, 'pipeline', 'docs', '03-quality-rubric.md'), 'utf8');
  designGuidance = fs.readFileSync(path.join(APP, 'pipeline', 'docs', '02-generation-pipeline.md'), 'utf8');

  let brief, meta, gameDir;
  let editSnapshot = null; // for edit mode: restore the game if the edit fails to pass
  const isEdit = !!editSlug && !!job.editFiles?.['index.html'];
  if (editSlug && !isEdit) throw new Error(`edit requested but ${editSlug} has no game files`);

  if (isEdit) {
    // ---------- 1b. designer (EDIT MODE) — amend an existing game in place ----------
    // The job carries the current game files (locally read from disk; in fleet
    // mode fetched from the app) — write them into the working dir, and keep
    // the originals as the snapshot so a failed edit reverts cleanly.
    gameDir = path.join(GAMES_DIR, editSlug);
    fs.mkdirSync(gameDir, { recursive: true });
    for (const [f, buf] of Object.entries(job.editFiles)) {
      if (buf) fs.writeFileSync(path.join(gameDir, f), buf);
    }
    meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'meta.json'), 'utf8')); // keep slug/title/boards
    trace('designer', `Editing "${meta.title}" per your prompt…`);
    editSnapshot = {
      'index.html': job.editFiles['index.html'],
      'cover.svg': job.editFiles['cover.svg'] ?? null,
      'DESIGN_BRIEF.md': job.editFiles['DESIGN_BRIEF.md'] ?? null,
    };
    const prevBrief = job.editFiles['DESIGN_BRIEF.md']?.toString('utf8') ?? '(no prior brief on disk)';
    const designerOut = await claude(
      `You are the GameSight DESIGNER agent editing an EXISTING game. Apply the creator's change to the current design — keep everything that works, change only what the prompt asks. Output the FULL updated DESIGN_BRIEF (not a diff).

Guidance:
${designGuidance}

CURRENT DESIGN_BRIEF:
${prevBrief}

Creator's change request: "${prompt}"

Output the complete updated brief inside a \`\`\`markdown fence. Nothing else.`,
      { phase: 'designer' }
    );
    brief = extractBlock(designerOut, 'markdown') ?? designerOut;
    fs.writeFileSync(path.join(gameDir, 'DESIGN_BRIEF.md'), brief);
    setGen({ slug: editSlug, brief });
    trace('designer', `Edit brief ready for ${editSlug}`);
  } else {
    // ---------- 1. designer (NEW GAME) ----------
    trace('designer', 'Designing the game…');
    const designerOut = await claude(
      `You are the GameSight DESIGNER agent — heavy planning, high taste, before any code.

Guidance (follow the "Stage 1 — Designer agent" section exactly, including the fun-drive dials and the wide creative space):
${designGuidance}

Creator's prompt: "${prompt}"

Produce:
1. A complete DESIGN_BRIEF (markdown) covering every bullet in Stage 1: fun-drive dials, core verb (≤5 words), the twist, failure model, structure/escalation, toy check if physics, mode (sp only for now), art direction (specific hexes, shape language), sound & juice plan, controls (desktop + touch), rendering route (canvas2d preferred; phaser only if physics-heavy).
2. A meta.json object per the conventions (slug: kebab-case, unique-feeling, not colliding with common words).

Output format: the brief inside a \`\`\`markdown fence, then the meta inside a \`\`\`json fence. Nothing else.`,
      { phase: 'designer' }
    );
    brief = extractBlock(designerOut, 'markdown') ?? designerOut;
    meta = extractJson(designerOut);
    if (!meta.slug || !/^[a-z0-9-]{3,40}$/.test(meta.slug)) throw new Error('designer produced invalid slug');
    if (!Array.isArray(meta.dials) || meta.dials.length === 0) meta.dials = ['mastery'];
    meta.title = meta.title ?? meta.slug;
    // Atomically claim the game dir: mkdir (non-recursive) fails with EEXIST if a
    // concurrent run already took the slug, so we never clobber another game.
    // (In fleet mode each worker has its own fs — the app re-resolves slug
    // collisions authoritatively at publish time.)
    gameDir = path.join(GAMES_DIR, meta.slug);
    try {
      fs.mkdirSync(gameDir);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      meta.slug = `${meta.slug}-${genId.slice(0, 4)}`;
      gameDir = path.join(GAMES_DIR, meta.slug);
      fs.mkdirSync(gameDir, { recursive: true });
    }
    fs.writeFileSync(path.join(gameDir, 'DESIGN_BRIEF.md'), brief);
    setGen({ slug: meta.slug, brief });
    trace('designer', `Brief ready: "${meta.title}" (${meta.slug}) — dials: ${JSON.stringify(meta.dials)}`);
  }

  // ---------- 2/3/4. build + verify + judge loop ----------
  let critique = '';
  let published = false;
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    _cycles = cycle;
    setGen({ cycles: cycle });
    trace('builder', cycle === 1 ? 'Writing the game…' : `Fixing per critique (cycle ${cycle})…`);
    const runBuilder = () => claude(
      `You are the GameSight BUILDER agent. Implement the design brief EXACTLY as one self-contained index.html per the conventions. Pure Canvas2D + WebAudio unless the brief demands Phaser (then use <script src="/vendor/phaser.min.js">).

CONVENTIONS (binding contract):
${conventions}

DESIGN BRIEF:
${brief}

${cycle > 1 ? `PREVIOUS ATTEMPT FAILED VERIFICATION. index.html already exists in your working directory. Judge critique to fix (fix ALL of it, change nothing that already works). Use Edit to patch it — do NOT rewrite the whole file:\n${critique}\n` : ''}
Write your work DIRECTLY TO DISK in your working directory (it is the game folder):
- \`index.html\` — the complete game (use the Write tool; never paste the file into a message)
- \`cover.svg\` — a 640x400 SVG cover in the game's own art language

A game is 40-70KB, which does not fit in a chat message — that is why you must use Write/Edit.
When both files are on disk, reply with only: DONE`,
      // The builder needs real write access: emitting a 70KB file through one
      // message hits the output limit, and on fix cycles Edit patches in place
      // instead of re-emitting everything (much cheaper). cwd IS the game dir.
      // NO Bash: the prompt is untrusted creator input, and a shell would let a
      // hostile prompt read the host env/DB. Read/Write/Edit covers the job.
      { tools: 'Read,Write,Edit', cwd: gameDir, timeoutMin: 40, phase: 'builder' }
    );
    // One retry on a mid-stream API failure: the builder is the longest, most
    // expensive call in the run, and a transient CLI/API drop should not burn a
    // whole judge cycle (which now costs the creator a credit refund round-trip).
    let builderOut;
    try {
      builderOut = await runBuilder();
    } catch (e) {
      trace('builder', `builder run failed (${short(e.message, 120)}) — retrying once`, 'tool');
      builderOut = await runBuilder();
    }
    // Disk is the contract now, not the transcript.
    const htmlPath = path.join(gameDir, 'index.html');
    if (!fs.existsSync(htmlPath) || fs.statSync(htmlPath).size < 500) {
      throw new Error(`builder produced no index.html (said: ${short(builderOut, 200)})`);
    }
    fs.writeFileSync(path.join(gameDir, 'meta.json'), JSON.stringify(meta, null, 2));
    trace('builder', `index.html written (${(fs.statSync(htmlPath).size / 1024).toFixed(0)} KB)`);

    // play-tester harness. Port 0 = OS-assigned, so concurrent builds can never
    // collide on a port (a bind failure here would burn a whole cycle); we parse
    // the actual port from the server's startup line, which doubles as the
    // readiness signal (replaces the old fixed sleep).
    trace('playtest', 'Play-testing on desktop + mobile…');
    const server = spawn('node', ['scripts/game-server.mjs', '0'], { cwd: APP, stdio: ['ignore', 'pipe', 'ignore'] });
    let verifyOut = '';
    let verifyFailed = false;
    try {
      const port = await new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('game server did not start within 10s')), 10_000);
        let out = '';
        server.stdout.on('data', (c) => {
          out += c.toString();
          const m = out.match(/localhost:(\d+)/);
          if (m) { clearTimeout(to); resolve(Number(m[1])); }
        });
        server.on('exit', () => { clearTimeout(to); reject(new Error('game server exited before listening')); });
      });
      try {
        verifyOut = execFileSync('node', ['scripts/verify-game.mjs', meta.slug, String(port)], {
          cwd: APP,
          encoding: 'utf8',
          timeout: 120_000,
        });
      } catch (e) {
        verifyOut = (e.stdout ?? '') + (e.stderr ?? '');
        verifyFailed = true;
      }
    } finally {
      server.kill();
    }
    trace('playtest', verifyOut.split('\n').filter(Boolean).slice(-8).join(' | '));

    // judge panel
    trace('judge', 'Judges scoring against the rubric…');
    const judgeOut = await claude(
      `You are the GameSight JUDGE PANEL (feel, taste, fun-drive, integration, content judges in one pass). Score this game against the rubric. Be strict about critical fails, generous to declared archetypes, and specific in critique.

RUBRIC:
${rubric}

DESIGN BRIEF (the promise to judge against):
${brief}

PLAY-TEST HARNESS OUTPUT (console errors, bridge messages):
${verifyOut || '(harness produced no output)'}
Harness hard-fail: ${verifyFailed}

Your working directory IS this game's folder. The game's code is at ./index.html and screenshots from the play-test are in ./_shots/ — READ the code and LOOK at every screenshot with the Read tool before scoring. Judge art direction from the screenshots like an art director. Read ONLY files within this folder.

PHYSICS INTEGRITY (rubric U3a — weight this heavily, it's the #1 failure mode): if the game has simulated motion, do NOT pass it unless you can justify from the code + evidence that (1) a run reliably TERMINATES — reaching a goal/death/end; flag any "flies forever / never loses / unbounded run with no resolution" as a CRITICAL fail; (2) the run is WINNABLE/completable by skilled play — read the level/goal geometry and the physics constants and reason about whether the goal is actually reachable; an unwinnable or impossible layout is a CRITICAL fail; (3) the feel is FORGIVING (not instant-death/brittle); (4) nothing freezes, tunnels, sticks, NaNs, or launches to infinity. Reason explicitly about termination and winnability in your critique. Do not assume the constants are tuned right — check them.

Output ONLY a \`\`\`json fence: {"score": 0-100, "criticalFails": ["..."], "critique": "specific, actionable, ordered by importance", "verdict": "publish" | "fix"}`,
      { tools: 'Read', cwd: gameDir, phase: 'judge' }
    );
    const verdict = extractJson(judgeOut);
    trace('judge', `score ${verdict.score}/100, critical fails: ${verdict.criticalFails?.length ?? 0} — ${verdict.verdict}`);
    setGen({ verdict: JSON.stringify(verdict) });

    if (verdict.verdict === 'publish' && verdict.score >= PASS_SCORE && !(verdict.criticalFails?.length) && !verifyFailed) {
      published = true;
      break;
    }
    critique = `${verdict.critique}\nCritical fails: ${JSON.stringify(verdict.criticalFails)}\nHarness output:\n${verifyOut.slice(0, 2000)}`;
  }

  if (published) {
    // A judge-passed game becomes a DRAFT owned by its creator — it does NOT
    // hit the public library until the creator clicks Publish. The reporter
    // owns the mechanics (row + published.json locally; file upload + server-
    // side slug resolution in fleet mode) and returns the final slug.
    const finalSlug = await R.publish(meta, creatorRef, gameDir);
    meta.slug = finalSlug;
    setGen({ slug: finalSlug });
    trace('publish', editSlug ? `Updated: /g/${finalSlug}` : `Ready to publish: /g/${finalSlug} (draft — click Publish)`);
    await R.finish('published'); // generation status (done), not game visibility
  } else if (editSnapshot) {
    // A failed EDIT must never break the live game — restore the pre-edit files.
    for (const [f, buf] of Object.entries(editSnapshot)) {
      if (buf) fs.writeFileSync(path.join(gameDir, f), buf);
    }
    trace('fail', 'The edit did not pass — your game is unchanged. Try a different change.');
    await R.finish('failed'); // failed runs refund app-side (or via LocalReporter)
  } else {
    // New game, not vetted — remove the build so it can never be sync-published (C1).
    try { fs.rmSync(gameDir, { recursive: true, force: true }); } catch { /* ignore */ }
    trace('fail', 'Cycle budget exhausted — not published. The critique is available for a re-prompt.');
    await R.finish('failed');
  }
  const byPhase = Object.entries(_cost.byPhase)
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([k, v]) => `${k} $${v.usd.toFixed(2)}(${v.calls})`)
    .join('  ');
  console.log(`\nCOST id=${genId} total=$${_cost.total.toFixed(3)} calls=${_cost.calls} cycles=${_cycles} phases: ${byPhase}`);
} catch (err) {
  trace('error', err.message ?? String(err));
  try {
    await R.finish('failed');
  } catch (e) {
    console.error('could not report failure:', e.message ?? e); // reaper will catch it
  }
  console.log(`\nCOST id=${genId} total=$${_cost.total.toFixed(3)} calls=${_cost.calls} status=error`);
  process.exit(1);
}
