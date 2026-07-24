import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { refundForGeneration } from '@/lib/credits';
import { verifyJobToken } from '@/lib/internal-auth';
import { readJson } from '@/lib/http';

// The build workers' single window into the app. Auth is a per-job HMAC token
// (see lib/internal-auth): a worker can only act on its own generation id.
// Money never crosses this boundary — `finish(failed)` triggers the app-side
// refund; amounts are never accepted from the worker.
const GAMES_DIR = path.join(process.cwd(), 'games');
const MAX_STREAM_EVENTS = 300; // mirror of pipeline/reporter.mjs trimTrace
const FILE_LIMITS: Record<string, number> = {
  'index.html': 512 * 1024,
  'cover.svg': 256 * 1024,
  'meta.json': 20 * 1024,
  'DESIGN_BRIEF.md': 64 * 1024,
};

type GenRow = {
  id: string;
  prompt: string;
  user_id: string;
  edit_slug: string;
  status: string;
  trace: string;
  last_seq: number;
  worker_machine: string;
};

function getGen(id: string): GenRow | undefined {
  return db().prepare('SELECT * FROM generations WHERE id = ?').get(id) as GenRow | undefined;
}

function trimTrace<T extends { stream?: string }>(events: T[]): T[] {
  const streamCount = events.reduce((n, e) => n + (e.stream ? 1 : 0), 0);
  if (streamCount <= MAX_STREAM_EVENTS) return events;
  let toDrop = streamCount - MAX_STREAM_EVENTS;
  return events.filter((e) => {
    if (!e.stream || toDrop === 0) return true;
    toDrop--;
    return false;
  });
}

// GET: the worker fetches its job spec (+ current game files in edit mode).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyJobToken(id, req.headers.get('x-build-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const gen = getGen(id);
  if (!gen) return NextResponse.json({ error: 'unknown job' }, { status: 404 });

  let editFiles: Record<string, string | null> | null = null;
  if (gen.edit_slug) {
    const dir = path.join(GAMES_DIR, gen.edit_slug);
    const read = (f: string) => {
      const p = path.resolve(dir, f);
      return p.startsWith(dir + path.sep) && fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null;
    };
    editFiles = {
      'index.html': read('index.html'),
      'cover.svg': read('cover.svg'),
      'DESIGN_BRIEF.md': read('DESIGN_BRIEF.md'),
      'meta.json': read('meta.json'),
    };
  }
  return NextResponse.json({ prompt: gen.prompt, ref: gen.user_id, editSlug: gen.edit_slug, editFiles });
}

// POST: events/patch batches, the publish payload, or the terminal status.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyJobToken(id, req.headers.get('x-build-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const gen = getGen(id);
  if (!gen) return NextResponse.json({ error: 'unknown job' }, { status: 404 });
  // 2MB: the publish payload is base64 game files (index.html cap 512KB →
  // ~700KB encoded) plus trace batches with 2KB thinking chunks
  const body = await readJson(req, 2 * 1024 * 1024);
  if (!body || typeof body.type !== 'string') return NextResponse.json({ error: 'bad payload' }, { status: 400 });

  if (typeof body.machine === 'string' && body.machine && !gen.worker_machine) {
    db().prepare('UPDATE generations SET worker_machine = ? WHERE id = ?').run(body.machine.slice(0, 32), id);
  }

  // Terminal rows accept nothing more: a reaped (refunded) build must not be
  // able to publish a "free" game or resurrect its trace. 409 is fatal to the
  // worker's reporter — the orphaned process gives up and the machine dies.
  if (gen.status !== 'running' && body.type !== 'finish') {
    return NextResponse.json({ error: 'build is no longer running' }, { status: 409 });
  }

  if (body.type === 'events') {
    const seq = Number(body.seq);
    if (!Number.isInteger(seq)) return NextResponse.json({ error: 'bad seq' }, { status: 400 });
    if (seq <= gen.last_seq) return NextResponse.json({ ok: true, dup: true }); // idempotent replay
    const incoming = Array.isArray(body.events) ? body.events : [];
    const clean = incoming
      .filter((e: unknown): e is { t: number; kind: string; detail: string; stream?: string } => {
        const ev = e as Record<string, unknown>;
        return typeof ev?.kind === 'string' && typeof ev?.detail === 'string';
      })
      .slice(0, 500)
      .map((e) => ({
        t: Number.isFinite(e.t) ? e.t : Date.now(),
        kind: String(e.kind).slice(0, 20),
        detail: String(e.detail).slice(0, 2000),
        ...(e.stream && ['thinking', 'tool', 'say'].includes(e.stream) ? { stream: e.stream } : {}),
      }));
    let trace: { stream?: string }[] = [];
    try {
      trace = JSON.parse(gen.trace || '[]');
    } catch {
      /* corrupted trace never blocks the build */
    }
    trace = trimTrace([...trace, ...clean]);

    // patch: only presentation fields; status changes only via `finish`
    const patch: Record<string, unknown> = {};
    const allowed = ['slug', 'brief', 'cycles', 'verdict', 'cost'];
    const rawPatch = (body.patch ?? {}) as Record<string, unknown>;
    for (const k of allowed) {
      if (rawPatch[k] !== undefined) patch[k] = rawPatch[k];
    }
    const sets = ['trace = ?', 'last_seq = ?', 'updated_at = ?', ...Object.keys(patch).map((k) => `${k} = ?`)].join(', ');
    db()
      .prepare(`UPDATE generations SET ${sets} WHERE id = ?`)
      .run(JSON.stringify(trace), seq, Date.now(), ...Object.values(patch).map((v) => (typeof v === 'number' ? v : String(v))), id);
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'publish') {
    const meta = (body.meta ?? {}) as Record<string, unknown>;
    const files = (body.files ?? {}) as Record<string, unknown>;
    let slug = String(meta.slug ?? '');
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 });
    const isEdit = !!gen.edit_slug;
    if (isEdit && slug !== gen.edit_slug) return NextResponse.json({ error: 'slug mismatch' }, { status: 400 });
    // authoritative slug claim: workers have private filesystems, so collisions
    // are resolved HERE, against the real games dir
    if (!isEdit && fs.existsSync(path.join(GAMES_DIR, slug))) slug = `${slug}-${id.slice(0, 4)}`;
    const dir = path.join(GAMES_DIR, slug);

    // ATOMIC publish: everything lands in a staging dir first and is validated
    // there; the live dir is swapped in one rename. A crash or bad payload can
    // never leave a half-updated public game. Staging dirs start with '.' so
    // the disk-sync (readdir + slug regex) can never see them as games.
    const staging = path.join(GAMES_DIR, `.staging-${id}`);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    try {
      for (const [name, limit] of Object.entries(FILE_LIMITS)) {
        const b64 = files[name];
        if (b64 == null) continue;
        const buf = Buffer.from(String(b64), 'base64');
        if (buf.length > limit) throw new Error(`${name} too large`);
        fs.writeFileSync(path.join(staging, name), buf);
      }
      if (!fs.existsSync(path.join(staging, 'index.html'))) throw new Error('no game file');
      fs.writeFileSync(path.join(staging, 'published.json'), JSON.stringify({ genId: id, at: Date.now() }));
      // swap: edits replace the existing dir via rename-aside; new games rename in
      if (fs.existsSync(dir)) {
        const old = path.join(GAMES_DIR, `.old-${id}`);
        fs.rmSync(old, { recursive: true, force: true });
        fs.renameSync(dir, old);
        fs.renameSync(staging, dir);
        fs.rmSync(old, { recursive: true, force: true });
      } else {
        fs.renameSync(staging, dir);
      }
    } catch (e) {
      fs.rmSync(staging, { recursive: true, force: true });
      return NextResponse.json({ error: e instanceof Error ? e.message : 'publish failed' }, { status: 400 });
    }
    // draft row + vetted marker — mirrors LocalReporter.publish / syncGamesFromDisk
    db()
      .prepare(
        `INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, boards, palette, author, status, creator_ref, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)
         ON CONFLICT(slug) DO UPDATE SET title=excluded.title, description=excluded.description, verb=excluded.verb,
           dials=excluded.dials, orientation=excluded.orientation, mode=excluded.mode,
           score_label=excluded.score_label, score_order=excluded.score_order, boards=excluded.boards, palette=excluded.palette`
      )
      .run(
        slug, String(meta.title ?? slug).slice(0, 80), String(meta.description ?? '').slice(0, 500), String(meta.verb ?? '').slice(0, 60),
        JSON.stringify(meta.dials ?? []), meta.orientation === 'portrait' ? 'portrait' : 'landscape', meta.mode === 'mp' ? 'mp' : 'sp',
        String(meta.scoreLabel ?? '').slice(0, 30), meta.scoreOrder === 'asc' ? 'asc' : 'desc',
        JSON.stringify(Array.isArray(meta.boards) ? meta.boards : []), JSON.stringify(meta.palette ?? []),
        String(meta.author ?? 'gamecraft').slice(0, 40), gen.user_id, Date.now()
      );
    return NextResponse.json({ ok: true, slug });
  }

  if (body.type === 'finish') {
    const status = body.status === 'published' ? 'published' : 'failed';
    db().prepare("UPDATE generations SET status = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(status, Date.now(), id);
    if (status === 'failed') refundForGeneration(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown type' }, { status: 400 });
}
