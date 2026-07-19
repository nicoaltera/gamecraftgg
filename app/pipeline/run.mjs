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
if (!prompt) {
  console.error('usage: node pipeline/run.mjs --prompt "..." [--id <id>]');
  process.exit(2);
}

// ---------- db trace ----------
const db = new Database(path.join(APP, 'data', 'gamesight.db'));
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000'); // shares the WAL db with the running app server
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

// ---------- claude helper (streaming) ----------
// Streams the agent's turns so the build page shows every thinking step, tool
// call, and message live — instead of hanging on one blocking call. Returns the
// concatenated assistant text for parsing. `cwd` scopes tool-enabled agents
// (the judge's Read) so a prompt-injected brief can't read app secrets.
function short(s, n = 150) {
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n) + '…' : one;
}
function claude(rolePrompt, { tools, timeoutMin = 15, cwd = APP, phase = 'agent' } = {}) {
  return new Promise((resolve, reject) => {
    const cliArgs = ['-p', rolePrompt, '--output-format', 'stream-json', '--verbose'];
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
        try {
          handleEvent(JSON.parse(line));
        } catch {
          /* ignore non-JSON lines */
        }
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
  // ---------- 1. designer ----------
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
  const brief = extractBlock(designerOut, 'markdown') ?? designerOut;
  const meta = extractJson(designerOut);
  if (!meta.slug || !/^[a-z0-9-]{3,40}$/.test(meta.slug)) throw new Error('designer produced invalid slug');
  if (!Array.isArray(meta.dials) || meta.dials.length === 0) meta.dials = ['mastery'];
  meta.title = meta.title ?? meta.slug;
  // Atomically claim the game dir: mkdir (non-recursive) fails with EEXIST if a
  // concurrent run already took the slug, so we never clobber another game.
  let gameDir = path.join(APP, 'games', meta.slug);
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

  // ---------- 2/3/4. build + verify + judge loop ----------
  let critique = '';
  let published = false;
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    setGen({ cycles: cycle });
    trace('builder', cycle === 1 ? 'Writing the game…' : `Fixing per critique (cycle ${cycle})…`);
    const builderOut = await claude(
      `You are the GameSight BUILDER agent. Implement the design brief EXACTLY as one self-contained index.html per the conventions. Pure Canvas2D + WebAudio unless the brief demands Phaser (then use <script src="/vendor/phaser.min.js">).

CONVENTIONS (binding contract):
${conventions}

DESIGN BRIEF:
${brief}

${cycle > 1 ? `PREVIOUS ATTEMPT FAILED VERIFICATION. The current index.html is at games/${meta.slug}/index.html. Judge critique to fix (fix ALL of it, change nothing that already works):\n${critique}\n` : ''}
Also produce cover.svg: a 640x400 SVG cover in the game's own art language.

Output format: complete index.html inside a \`\`\`html fence, then cover.svg inside a \`\`\`xml fence. No commentary.`,
      { timeoutMin: 40, phase: 'builder' }
    );
    const html = extractBlock(builderOut, 'html');
    const cover = extractBlock(builderOut, 'xml') ?? extractBlock(builderOut, 'svg');
    if (!html) throw new Error('builder produced no index.html');
    fs.writeFileSync(path.join(gameDir, 'index.html'), html);
    if (cover) fs.writeFileSync(path.join(gameDir, 'cover.svg'), cover);
    fs.writeFileSync(path.join(gameDir, 'meta.json'), JSON.stringify(meta, null, 2));
    trace('builder', `index.html written (${(html.length / 1024).toFixed(0)} KB)`);

    // play-tester harness
    trace('playtest', 'Play-testing on desktop + mobile…');
    const port = 9100 + Math.floor(Math.random() * 400);
    const server = spawn('node', ['scripts/game-server.mjs', String(port)], { cwd: APP, stdio: 'ignore' });
    let verifyOut = '';
    let verifyFailed = false;
    try {
      await new Promise((r) => setTimeout(r, 800));
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
    // registering in the DB happens via syncGamesFromDisk on next db() open in the app;
    // do it here directly so the game page is live immediately.
    db.prepare(
      `INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, palette, author, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET title=excluded.title, description=excluded.description, verb=excluded.verb`
    ).run(
      meta.slug, meta.title, meta.description ?? '', meta.verb ?? '', JSON.stringify(meta.dials ?? []),
      meta.orientation ?? 'landscape', meta.mode ?? 'sp', meta.scoreLabel ?? '',
      meta.scoreOrder === 'asc' ? 'asc' : 'desc', JSON.stringify(meta.palette ?? []), 'creator', Date.now()
    );
    setGen({ status: 'published' });
    trace('publish', `Published: /g/${meta.slug}`);
  } else {
    setGen({ status: 'failed' });
    trace('fail', 'Cycle budget exhausted — not published. The critique is available for a re-prompt.');
  }
} catch (err) {
  setGen({ status: 'failed' });
  trace('error', err.message ?? String(err));
  process.exit(1);
}
