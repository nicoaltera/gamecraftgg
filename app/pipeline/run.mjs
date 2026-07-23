// GameSight generation pipeline (02-generation-pipeline.md), runnable as:
//   node pipeline/run.mjs --prompt "a game about ..." [--id <generationId>]
// Requires the `claude` CLI (Claude Code) on PATH. Agents in the loop:
//   designer -> builder -> [play-tester harness + judge] x cycles -> publish
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Database = require(path.join(APP, 'node_modules', 'better-sqlite3'));

const MAX_CYCLES = 3;
const PASS_SCORE = 80;

// ---------- args ----------
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const prompt = arg('prompt');
const genId = arg('id') ?? crypto.randomBytes(8).toString('hex');
const creatorRef = arg('ref') ?? '';        // owner of the resulting game
const editSlug = arg('edit') ?? '';          // if set, iterate an existing game in place
if (!prompt) {
  console.error('usage: node pipeline/run.mjs --prompt "..." [--id <id>] [--ref <ref>] [--edit <slug>]');
  process.exit(2);
}

// ---------- db trace ----------
const db = new Database(path.join(APP, 'data', 'gamesight.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000'); // shares the WAL db with the running app server
// The pipeline is a separate process from the app, so it can run against a DB
// whose schema predates a column it writes. Ensure the one column it owns.
if (!db.prepare('PRAGMA table_info(generations)').all().some((c) => c.name === 'cost')) {
  db.exec("ALTER TABLE generations ADD COLUMN cost TEXT DEFAULT '{}'");
}
db.prepare(
  `INSERT INTO generations (id, prompt, status, created_at, updated_at) VALUES (?, ?, 'running', ?, ?)
   ON CONFLICT(id) DO UPDATE SET status='running', updated_at=excluded.updated_at`
).run(genId, prompt, Date.now(), Date.now());

// The trace is the live feed the build page renders. `stream` marks fine-grained
// agent activity (thinking / tool / say) vs. the coarse stage-boundary rows.
const _events = (() => {
  const row = db.prepare('SELECT trace FROM generations WHERE id = ?').get(genId);
  return JSON.parse(row?.trace ?? '[]');
})();
let _lastFlush = 0;
function flushTrace(force = false) {
  const now = Date.now();
  if (!force && now - _lastFlush < 400) return; // throttle DB writes during bursty streams
  _lastFlush = now;
  db.prepare('UPDATE generations SET trace = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(_events), now, genId);
}
function trace(kind, detail, stream) {
  const ev = { t: Date.now(), kind, detail: String(detail).slice(0, 2000) };
  if (stream) ev.stream = stream;
  _events.push(ev);
  flushTrace(!stream); // stage rows flush immediately; stream rows are throttled
  console.log(`[${kind}${stream ? '/' + stream : ''}] ${String(detail).slice(0, 160)}`);
}
function setGen(fields) {
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE generations SET ${sets}, updated_at = ? WHERE id = ?`).run(...Object.values(fields), Date.now(), genId);
}

// A failed run gives the credits back. The generate route debited (reason
// 'debit', ref_id = this generation id) at admission; mirroring that row with
// a 'refund' entry is idempotent — UNIQUE(reason, ref_id) means a crash-looped
// pipeline can only ever refund once. Standalone CLI runs have no debit row,
// so this is a no-op for them (and for pre-credits DBs, hence the try).
function refundIfDebited() {
  try {
    const deb = db.prepare("SELECT user_id, delta FROM credit_entries WHERE reason = 'debit' AND ref_id = ?").get(genId);
    if (!deb) return;
    const r = db
      .prepare("INSERT OR IGNORE INTO credit_entries (user_id, delta, reason, ref_id, created_at) VALUES (?, ?, 'refund', ?, ?)")
      .run(deb.user_id, -deb.delta, genId, Date.now());
    if (r.changes > 0) trace('fail', `Your ${-deb.delta} credits are back in your account.`);
  } catch {
    /* no credits schema in this DB — nothing to refund */
  }
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

function claude(rolePrompt, { tools, timeoutMin = 15, cwd = APP, phase = 'agent' } = {}) {
  return new Promise((resolve, reject) => {
    const cliArgs = ['-p', rolePrompt, '--output-format', 'stream-json', '--verbose'];
    if (MODELS[phase]) cliArgs.push('--model', MODELS[phase]);
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
      flushTrace(true);
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

const conventions = fs.readFileSync(path.join(APP, 'CONVENTIONS.md'), 'utf8');
const rubric = fs.readFileSync(path.join(APP, '..', '03-quality-rubric.md'), 'utf8');
const designGuidance = fs.readFileSync(path.join(APP, '..', '02-generation-pipeline.md'), 'utf8');

try {
  let brief, meta, gameDir;
  let editSnapshot = null; // for edit mode: restore the game if the edit fails to pass
  const editRow = editSlug ? db.prepare('SELECT * FROM games WHERE slug = ?').get(editSlug) : null;

  if (editRow) {
    // ---------- 1b. designer (EDIT MODE) — amend an existing game in place ----------
    trace('designer', `Editing "${editRow.title}" per your prompt…`);
    gameDir = path.join(APP, 'games', editSlug);
    // snapshot the live game so a failed edit reverts cleanly (never break a good game)
    const snap = (f) => (fs.existsSync(path.join(gameDir, f)) ? fs.readFileSync(path.join(gameDir, f)) : null);
    editSnapshot = { 'index.html': snap('index.html'), 'cover.svg': snap('cover.svg'), 'DESIGN_BRIEF.md': snap('DESIGN_BRIEF.md') };
    const prevBrief = fs.existsSync(path.join(gameDir, 'DESIGN_BRIEF.md'))
      ? fs.readFileSync(path.join(gameDir, 'DESIGN_BRIEF.md'), 'utf8')
      : '(no prior brief on disk)';
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
    meta = JSON.parse(fs.readFileSync(path.join(gameDir, 'meta.json'), 'utf8')); // keep slug/title/boards
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
    gameDir = path.join(APP, 'games', meta.slug);
    try {
      fs.mkdirSync(gameDir);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      meta.slug = `${meta.slug}-${genId.slice(0, 4)}`;
      gameDir = path.join(APP, 'games', meta.slug);
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
      { tools: 'Read,Write,Edit,Bash', cwd: gameDir, timeoutMin: 40, phase: 'builder' }
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
    // A judge-passed game becomes a DRAFT owned by its creator — it does NOT hit
    // the public library until the creator clicks Publish. The published.json
    // marker means "vetted & real" (lets syncGamesFromDisk see it); the DB
    // `status` (draft/published) controls public visibility. ON CONFLICT (edit
    // mode) preserves status + creator_ref so an edit doesn't un-publish or
    // re-own the game. Column set mirrors syncGamesFromDisk incl. `boards` (M2).
    db.prepare(
      `INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, boards, palette, author, status, creator_ref, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
       ON CONFLICT(slug) DO UPDATE SET title=excluded.title, description=excluded.description, verb=excluded.verb,
         dials=excluded.dials, orientation=excluded.orientation, mode=excluded.mode,
         score_label=excluded.score_label, score_order=excluded.score_order, boards=excluded.boards, palette=excluded.palette`
    ).run(
      meta.slug, meta.title, meta.description ?? '', meta.verb ?? '', JSON.stringify(meta.dials ?? []),
      meta.orientation ?? 'landscape', meta.mode ?? 'sp', meta.scoreLabel ?? '',
      meta.scoreOrder === 'asc' ? 'asc' : 'desc', JSON.stringify(Array.isArray(meta.boards) ? meta.boards : []),
      JSON.stringify(meta.palette ?? []), meta.author ?? 'gamesight', creatorRef, Date.now()
    );
    fs.writeFileSync(path.join(gameDir, 'published.json'), JSON.stringify({ genId, at: Date.now() }));
    setGen({ status: 'published' });   // generation status (done), not game visibility
    trace('publish', editSlug ? `Updated: /g/${meta.slug}` : `Ready to publish: /g/${meta.slug} (draft — click Publish)`);
  } else if (editSnapshot) {
    // A failed EDIT must never break the live game — restore the pre-edit files.
    for (const [f, buf] of Object.entries(editSnapshot)) {
      if (buf) fs.writeFileSync(path.join(gameDir, f), buf);
    }
    setGen({ status: 'failed' });
    trace('fail', 'The edit did not pass — your game is unchanged. Try a different change.');
    refundIfDebited();
  } else {
    // New game, not vetted — remove the build so it can never be sync-published (C1).
    try { fs.rmSync(gameDir, { recursive: true, force: true }); } catch { /* ignore */ }
    setGen({ status: 'failed' });
    trace('fail', 'Cycle budget exhausted — not published. The critique is available for a re-prompt.');
    refundIfDebited();
  }
  const byPhase = Object.entries(_cost.byPhase)
    .sort((a, b) => b[1].usd - a[1].usd)
    .map(([k, v]) => `${k} $${v.usd.toFixed(2)}(${v.calls})`)
    .join('  ');
  console.log(`\nCOST id=${genId} total=$${_cost.total.toFixed(3)} calls=${_cost.calls} cycles=${_cycles} phases: ${byPhase}`);
} catch (err) {
  setGen({ status: 'failed' });
  trace('error', err.message ?? String(err));
  refundIfDebited();
  console.log(`\nCOST id=${genId} total=$${_cost.total.toFixed(3)} calls=${_cost.calls} status=error`);
  process.exit(1);
}
