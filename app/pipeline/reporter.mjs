// The pipeline's ONE window to the world. Every side effect run.mjs has —
// trace events, status fields, publishing a game, finishing a run — goes
// through a Reporter. Two implementations:
//
//   LocalReporter  — direct SQLite + filesystem (dev, CLI, single-box mode).
//   RemoteReporter — batched, idempotent HTTP to the app's internal build API
//                    (fleet mode: each build runs on its own Fly machine).
//
// Mode is chosen by flags: `--job <id>` selects remote (GC_REPORT_URL +
// GC_JOB_TOKEN in env); classic `--prompt/--id` flags select local. The
// pipeline logic itself never knows which one it's talking to.
//
// Money note: RemoteReporter cannot touch credits at all — refunds happen
// app-side on `finish`. A compromised worker can only report on its own build.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- shared: ring-buffered trace ----------
// Stage-boundary events are the story and are always kept; stream events
// (thinking/tool/say) are theater and cap out — this is what keeps the trace
// blob (rewritten on every flush) from becoming a write-amplification bomb at
// fleet scale. 300 stream events ≈ plenty for the build page's notebook.
const MAX_STREAM_EVENTS = 300;

export function trimTrace(events) {
  const streamCount = events.reduce((n, e) => n + (e.stream ? 1 : 0), 0);
  if (streamCount <= MAX_STREAM_EVENTS) return events;
  let toDrop = streamCount - MAX_STREAM_EVENTS;
  return events.filter((e) => {
    if (!e.stream || toDrop === 0) return true;
    toDrop--;
    return false;
  });
}

function makeThrottle() {
  let last = 0;
  return (count, force) => {
    // flush cadence backs off as the trace grows — most writes early (fast,
    // small blob), fewer late (bigger blob)
    const interval = count > 200 ? 1500 : count > 80 ? 800 : 400;
    const now = Date.now();
    if (!force && now - last < interval) return false;
    last = now;
    return true;
  };
}

// ---------- local: SQLite + filesystem (today's behavior) ----------
class LocalReporter {
  constructor({ genId, prompt, ref, editSlug, fromDb }) {
    this.genId = genId;
    const Database = require(path.join(APP, 'node_modules', 'better-sqlite3'));
    this.db = new Database(path.join(APP, 'data', 'gamesight.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000'); // shares the WAL db with the app server
    if (!this.db.prepare('PRAGMA table_info(generations)').all().some((c) => c.name === 'cost')) {
      this.db.exec("ALTER TABLE generations ADD COLUMN cost TEXT DEFAULT '{}'");
    }
    if (fromDb) {
      // dispatched by the app (`--job-local`): the row IS the job spec
      const row = this.db.prepare('SELECT prompt, user_id, edit_slug FROM generations WHERE id = ?').get(genId);
      if (!row) throw new Error(`no generation row for job ${genId}`);
      this.job = { prompt: row.prompt, ref: row.user_id ?? '', editSlug: row.edit_slug ?? '' };
    } else {
      this.job = { prompt, ref, editSlug }; // standalone CLI run
    }
    this.db
      .prepare(
        `INSERT INTO generations (id, prompt, status, created_at, updated_at) VALUES (?, ?, 'running', ?, ?)
         ON CONFLICT(id) DO UPDATE SET status='running', updated_at=excluded.updated_at`
      )
      .run(genId, this.job.prompt, Date.now(), Date.now());
    const row = this.db.prepare('SELECT trace FROM generations WHERE id = ?').get(genId);
    this.events = JSON.parse(row?.trace ?? '[]');
    this.shouldFlush = makeThrottle();
  }

  async getJob() {
    const j = { ...this.job, editFiles: null };
    if (j.editSlug) {
      const dir = path.join(APP, 'games', j.editSlug);
      const read = (f) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f)) : null);
      j.editFiles = {
        'index.html': read('index.html'),
        'cover.svg': read('cover.svg'),
        'DESIGN_BRIEF.md': read('DESIGN_BRIEF.md'),
        'meta.json': read('meta.json'),
      };
    }
    return j;
  }

  gamesDir() {
    return path.join(APP, 'games');
  }

  trace(kind, detail, stream) {
    const ev = { t: Date.now(), kind, detail: String(detail).slice(0, 2000) };
    if (stream) ev.stream = stream;
    this.events.push(ev);
    this.events = trimTrace(this.events);
    this.#flush(!stream);
  }

  #flush(force = false) {
    if (!this.shouldFlush(this.events.length, force)) return;
    this.db
      .prepare('UPDATE generations SET trace = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(this.events), Date.now(), this.genId);
  }

  async set(fields) {
    if (Object.keys(fields).length === 0) {
      this.#flush(true); // empty set = "make sure the trace tail is on disk"
      return;
    }
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
    this.db
      .prepare(`UPDATE generations SET ${sets}, updated_at = ? WHERE id = ?`)
      .run(...Object.values(fields), Date.now(), this.genId);
  }

  // Judge-passed games go LIVE immediately — the judge is the quality gate,
  // and inviting the world is the whole point. (No draft step: founder call.)
  async publish(meta, creatorRef, gameDir) {
    this.db
      .prepare(
        `INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, boards, palette, author, status, creator_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
         ON CONFLICT(slug) DO UPDATE SET title=excluded.title, description=excluded.description, verb=excluded.verb,
           dials=excluded.dials, orientation=excluded.orientation, mode=excluded.mode,
           score_label=excluded.score_label, score_order=excluded.score_order, boards=excluded.boards, palette=excluded.palette`
      )
      .run(
        meta.slug, meta.title, meta.description ?? '', meta.verb ?? '', JSON.stringify(meta.dials ?? []),
        meta.orientation ?? 'landscape', meta.mode ?? 'sp', meta.scoreLabel ?? '',
        meta.scoreOrder === 'asc' ? 'asc' : 'desc', JSON.stringify(Array.isArray(meta.boards) ? meta.boards : []),
        JSON.stringify(meta.palette ?? []), meta.author ?? 'gamecraft', creatorRef, Date.now()
      );
    fs.writeFileSync(path.join(gameDir, 'published.json'), JSON.stringify({ genId: this.genId, at: Date.now() }));
    return meta.slug;
  }

  async finish(status) {
    await this.set({ status });
    if (status === 'failed') this.#refundIfDebited();
    this.#flush(true);
  }

  // Mirrors the app's refund path; idempotent on the ledger's UNIQUE key.
  #refundIfDebited() {
    try {
      const deb = this.db
        .prepare("SELECT user_id, delta FROM credit_entries WHERE reason = 'debit' AND ref_id = ?")
        .get(this.genId);
      if (!deb) return;
      const r = this.db
        .prepare("INSERT OR IGNORE INTO credit_entries (user_id, delta, reason, ref_id, created_at) VALUES (?, ?, 'refund', ?, ?)")
        .run(deb.user_id, -deb.delta, this.genId, Date.now());
      if (r.changes > 0) this.trace('fail', 'Your credits are back in your account.');
    } catch {
      /* no credits schema in this DB — nothing to refund */
    }
  }
}

// ---------- remote: HTTP to the app's internal build API ----------
class RemoteReporter {
  constructor({ genId }) {
    this.genId = genId;
    this.base = (process.env.GC_REPORT_URL ?? '').replace(/\/$/, '');
    this.token = process.env.GC_JOB_TOKEN ?? '';
    if (!this.base || !this.token) throw new Error('remote mode needs GC_REPORT_URL and GC_JOB_TOKEN');
    this.events = [];       // full local copy (for trimming decisions)
    this.pending = [];      // not-yet-delivered events
    this.pendingPatch = {}; // not-yet-delivered field updates
    this.seq = 0;
    this.machine = process.env.FLY_MACHINE_ID ?? '';
    this.shouldFlush = makeThrottle();
    this.inFlight = null;
  }

  async #post(payload, tries = 4) {
    let wait = 2000;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(`${this.base}/api/internal/build/${this.genId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-build-token': this.token },
          body: JSON.stringify({ ...payload, machine: this.machine }),
        });
        if (res.ok) return await res.json();
        // 4xx = our bug or revoked job: retrying won't help
        if (res.status < 500) throw Object.assign(new Error(`build api ${res.status}`), { fatal: true });
      } catch (e) {
        if (e.fatal || i === tries - 1) throw e;
      }
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2.5, 20_000);
    }
    throw new Error('build api unreachable');
  }

  async getJob() {
    const res = await fetch(`${this.base}/api/internal/build/${this.genId}`, {
      headers: { 'x-build-token': this.token },
    });
    if (!res.ok) throw new Error(`could not fetch job: ${res.status}`);
    const j = await res.json();
    if (j.editFiles) {
      for (const k of Object.keys(j.editFiles)) {
        j.editFiles[k] = j.editFiles[k] == null ? null : Buffer.from(j.editFiles[k], 'base64');
      }
    }
    return j;
  }

  // Workers run from the image where /app/games was moved aside at build time —
  // recreate a scratch games dir; nothing here persists (publish ships bytes).
  gamesDir() {
    const dir = path.join(APP, 'games');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  trace(kind, detail, stream) {
    const ev = { t: Date.now(), kind, detail: String(detail).slice(0, 2000) };
    if (stream) ev.stream = stream;
    this.events.push(ev);
    this.pending.push(ev);
    // bound the retry buffer the same way the trace itself is bounded
    if (this.pending.length > MAX_STREAM_EVENTS + 50) {
      const idx = this.pending.findIndex((e) => e.stream);
      if (idx >= 0) this.pending.splice(idx, 1);
    }
    void this.#flush(!stream);
  }

  async set(fields) {
    Object.assign(this.pendingPatch, fields);
    await this.#flush(true);
  }

  async #flush(force = false) {
    if (!force && !this.shouldFlush(this.events.length, false)) return;
    if (this.inFlight) return; // one batch on the wire at a time; rest queues
    if (this.pending.length === 0 && Object.keys(this.pendingPatch).length === 0) return;
    // ≤100 events per batch (2KB details → ~200KB worst case, far under the
    // server's 2MB bound); the remainder rides the next flush
    const events = this.pending.slice(0, 100);
    this.pending = this.pending.slice(100);
    const patch = this.pendingPatch;
    this.pendingPatch = {};
    this.inFlight = this.#post({ type: 'events', seq: ++this.seq, events, patch })
      .catch(() => {
        // put everything back for the next attempt — idempotency lives in seq
        this.pending = [...events, ...this.pending];
        this.pendingPatch = { ...patch, ...this.pendingPatch };
        this.seq--;
      })
      .finally(() => {
        this.inFlight = null;
      });
    await this.inFlight;
  }

  async publish(meta, creatorRef, gameDir) {
    await this.#drain();
    const read = (f) => {
      const p = path.join(gameDir, f);
      return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null;
    };
    const res = await this.#post({
      type: 'publish',
      meta,
      files: {
        'index.html': read('index.html'),
        'cover.svg': read('cover.svg'),
        'meta.json': read('meta.json'),
        'DESIGN_BRIEF.md': read('DESIGN_BRIEF.md'),
      },
    });
    return res.slug; // server resolves slug collisions; its answer is final
  }

  async finish(status) {
    await this.#drain();
    await this.#post({ type: 'finish', status });
  }

  async #drain() {
    for (let i = 0; i < 10 && (this.pending.length || this.inFlight); i++) {
      await this.inFlight;
      await this.#flush(true);
    }
  }
}

export async function createReporter(opts) {
  return opts.remote ? new RemoteReporter(opts) : new LocalReporter(opts);
}
