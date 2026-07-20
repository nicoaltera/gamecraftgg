import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// SQLite for v1 (zero-infra local production). Schema is deliberately portable
// to Postgres — see 05-architecture.md; swap this module when hosting lands.

const DATA_DIR = path.join(process.cwd(), 'data');
const GAMES_DIR = path.join(process.cwd(), 'games');

let _db: Database.Database | null = null;
let _lastSync = 0;
const SYNC_INTERVAL_MS = 30_000;

export function db(): Database.Database {
  if (_db) {
    // The pipeline publishes new game folders while the server runs — pick
    // them up without a restart, cheaply.
    if (Date.now() - _lastSync > SYNC_INTERVAL_MS) {
      _lastSync = Date.now();
      syncGamesFromDisk(_db);
    }
    return _db;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, 'gamesight.db'));
  _db.pragma('journal_mode = WAL');
  _db.pragma('busy_timeout = 5000'); // app + detached pipeline share the WAL db
  migrate(_db);
  syncGamesFromDisk(_db);
  _lastSync = Date.now();
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS games (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      verb TEXT DEFAULT '',
      dials TEXT DEFAULT '[]',
      orientation TEXT DEFAULT 'landscape',
      mode TEXT DEFAULT 'sp',
      score_label TEXT DEFAULT '',
      score_order TEXT DEFAULT 'desc',
      boards TEXT DEFAULT '[]',
      palette TEXT DEFAULT '[]',
      author TEXT DEFAULT 'gamesight',
      status TEXT DEFAULT 'published',
      creator_ref TEXT DEFAULT '',
      parent_slug TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      ref TEXT,
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      duration_ms INTEGER DEFAULT 0,
      runs INTEGER DEFAULT 0,
      best_score INTEGER,
      is_mobile INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      board TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      quarantined INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referral_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      ref TEXT NOT NULL,
      kind TEXT NOT NULL, -- click | play | share
      session_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      session_id TEXT,
      reason TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      slug TEXT,
      prompt TEXT NOT NULL,
      status TEXT DEFAULT 'running', -- running | published | failed
      brief TEXT,
      trace TEXT DEFAULT '[]',       -- json array of pipeline events
      cycles INTEGER DEFAULT 0,
      verdict TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ratings (
      slug TEXT NOT NULL,
      ref TEXT NOT NULL,
      stars REAL NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (slug, ref)
    );
    CREATE INDEX IF NOT EXISTS idx_scores_slug ON scores(slug, board, quarantined, score);
    CREATE INDEX IF NOT EXISTS idx_plays_slug ON plays(slug, started_at);
    CREATE INDEX IF NOT EXISTS idx_edges_slug ON referral_edges(slug, kind);
  `);
  // additive migrations for DBs created before a column existed
  const reportCols = (d.prepare('PRAGMA table_info(reports)').all() as { name: string }[]).map((c) => c.name);
  if (!reportCols.includes('session_id')) d.exec('ALTER TABLE reports ADD COLUMN session_id TEXT');
  const gameCols = (d.prepare('PRAGMA table_info(games)').all() as { name: string }[]).map((c) => c.name);
  if (!gameCols.includes('boards')) d.exec("ALTER TABLE games ADD COLUMN boards TEXT DEFAULT '[]'");
  const scoreCols = (d.prepare('PRAGMA table_info(scores)').all() as { name: string }[]).map((c) => c.name);
  if (!scoreCols.includes('board')) d.exec("ALTER TABLE scores ADD COLUMN board TEXT NOT NULL DEFAULT ''");
  if (!gameCols.includes('creator_ref')) d.exec("ALTER TABLE games ADD COLUMN creator_ref TEXT DEFAULT ''");
  if (!gameCols.includes('parent_slug')) d.exec("ALTER TABLE games ADD COLUMN parent_slug TEXT DEFAULT ''");
  // per-generation agent spend: {total, byPhase:{...}, calls, model} — the input to credit pricing
  const genCols = (d.prepare('PRAGMA table_info(generations)').all() as { name: string }[]).map((c) => c.name);
  if (!genCols.includes('cost')) d.exec("ALTER TABLE generations ADD COLUMN cost TEXT DEFAULT '{}'");
  // index goes AFTER the column exists (the column is ALTER-added for old DBs)
  d.exec('CREATE INDEX IF NOT EXISTS idx_games_creator ON games(creator_ref)');
}

export type Board = { key: string; label: string; order: 'asc' | 'desc'; primary: boolean; challenge: boolean };

// A game declares one or more leaderboards. Games with a completable goal should
// rank by efficiency-to-goal (fewest attempts / fastest time), not raw score;
// dual boards let an endless chase and a completion challenge coexist. `primary`
// is the headline leaderboard; `challenge` marks the board the per-run "dare a
// friend" link uses (a cross-session completion metric makes a poor per-run dare,
// so a game can point the dare at its endless board while ranking on efficiency).
export function parseBoards(row: { boards?: string; score_label: string; score_order: 'asc' | 'desc' }): Board[] {
  try {
    const arr = JSON.parse(row.boards || '[]');
    if (Array.isArray(arr) && arr.length) {
      const boards = arr.map((b) => ({
        key: String(b.key ?? ''),
        label: String(b.label ?? ''),
        order: b.order === 'asc' ? 'asc' : ('desc' as 'asc' | 'desc'),
        primary: !!b.primary,
        challenge: !!b.challenge,
      }));
      if (!boards.some((b) => b.primary)) boards[0].primary = true;
      if (!boards.some((b) => b.challenge)) boards.find((b) => b.primary)!.challenge = true;
      return boards;
    }
  } catch {
    /* fall through to the single-board default */
  }
  // back-compat: synthesize one board from the legacy single score fields
  return [{ key: '', label: row.score_label, order: row.score_order, primary: true, challenge: true }];
}

export type GameMeta = {
  slug: string;
  title: string;
  description: string;
  verb: string;
  dials: string[];
  orientation: string;
  mode: string;
  scoreLabel: string;
  scoreOrder: 'asc' | 'desc';
  palette: string[];
  author: string;
};

function syncGamesFromDisk(d: Database.Database) {
  if (!fs.existsSync(GAMES_DIR)) return;
  const dirEntries = fs.readdirSync(GAMES_DIR);
  const upsert = d.prepare(`
    INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, boards, palette, author, created_at)
    VALUES (@slug, @title, @description, @verb, @dials, @orientation, @mode, @scoreLabel, @scoreOrder, @boards, @palette, @author, @createdAt)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, description=excluded.description, verb=excluded.verb,
      dials=excluded.dials, orientation=excluded.orientation, mode=excluded.mode,
      score_label=excluded.score_label, score_order=excluded.score_order, boards=excluded.boards, palette=excluded.palette
  `);
  for (const slug of dirEntries) {
    const metaPath = path.join(GAMES_DIR, slug, 'meta.json');
    const htmlPath = path.join(GAMES_DIR, slug, 'index.html');
    // A game is only published once a `published.json` marker exists. The pipeline
    // writes files during build/verify but only drops this marker after the judge
    // PASSES — so mid-build and failed games never go live via disk sync. Seed
    // games ship the marker. This makes the judge gate real, not decorative (C1).
    if (!fs.existsSync(path.join(GAMES_DIR, slug, 'published.json'))) continue;
    if (!fs.existsSync(metaPath) || !fs.existsSync(htmlPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      upsert.run({
        slug,
        title: meta.title ?? slug,
        description: meta.description ?? '',
        verb: meta.verb ?? '',
        dials: JSON.stringify(meta.dials ?? []),
        orientation: meta.orientation ?? 'landscape',
        mode: meta.mode ?? 'sp',
        scoreLabel: meta.scoreLabel ?? '',
        scoreOrder: meta.scoreOrder === 'asc' ? 'asc' : 'desc',
        boards: JSON.stringify(Array.isArray(meta.boards) ? meta.boards : []),
        palette: JSON.stringify(meta.palette ?? []),
        author: meta.author ?? 'gamesight',
        createdAt: Math.floor(fs.statSync(htmlPath).mtimeMs), // NOT | 0 — that 32-bit-truncates a ~1.7e12 ms value
      });
    } catch {
      // a malformed meta.json never takes the site down; the game just stays unlisted
    }
  }
  // Reconcile: a game folder is the source of truth (the /play route serves from disk),
  // so a DB row whose folder no longer exists is a ghost that would 404 in the feed. Drop
  // those. Guard on a non-empty listing so a transient read never wipes the table. Drafts
  // keep their folder (the pipeline writes it), so this only removes truly-deleted games.
  if (dirEntries.length > 0) {
    const onDisk = new Set(dirEntries);
    const del = d.prepare('DELETE FROM games WHERE slug = ?');
    for (const { slug } of d.prepare('SELECT slug FROM games').all() as { slug: string }[]) {
      if (!onDisk.has(slug)) del.run(slug);
    }
  }
}

export type GameRow = {
  slug: string;
  title: string;
  description: string;
  verb: string;
  dials: string;
  orientation: string;
  mode: string;
  score_label: string;
  score_order: 'asc' | 'desc';
  boards: string;
  palette: string;
  author: string;
  status: string;
  creator_ref: string;
  parent_slug: string;
  created_at: number;
};

// Public lookup (feed, OG). Only published games.
export function getGame(slug: string): GameRow | undefined {
  return db().prepare('SELECT * FROM games WHERE slug = ? AND status = ?').get(slug, 'published') as GameRow | undefined;
}
// Any-status lookup (owner viewing a draft, publish/remix/edit flows).
export function getGameAny(slug: string): GameRow | undefined {
  return db().prepare("SELECT * FROM games WHERE slug = ? AND status != 'unlisted'").get(slug) as GameRow | undefined;
}

export function getRating(slug: string): { avg: number; count: number } {
  const r = db().prepare('SELECT AVG(stars) AS avg, COUNT(*) AS count FROM ratings WHERE slug = ?').get(slug) as {
    avg: number | null;
    count: number;
  };
  return { avg: r.avg ?? 0, count: r.count };
}

export function getUserGames(ref: string): (GameRow & { rating: number; ratingCount: number })[] {
  if (!ref) return [];
  return db()
    .prepare(
      `SELECT g.*, COALESCE(AVG(r.stars),0) AS rating, COUNT(r.stars) AS ratingCount
       FROM games g LEFT JOIN ratings r ON r.slug = g.slug
       WHERE g.creator_ref = ? AND g.status != 'unlisted'
       GROUP BY g.slug ORDER BY g.created_at DESC`
    )
    .all(ref) as (GameRow & { rating: number; ratingCount: number })[];
}

export type FeedItem = GameRow & {
  plays: number;
  total_plays: number;
  avg_runs: number;
  heat: number;
  rating: number;
  rating_count: number;
};

// Retention-ranked feed: recent (7-day) plays weighted by how much people replay
// and stick drive `heat`; `total_plays` is the lifetime count shown on the card
// (social proof that never resets to "new" once a game has real plays).
export function getFeed(limit = 24): FeedItem[] {
  const rows = db()
    .prepare(
      `
    SELECT g.*,
      COALESCE(p.plays, 0) AS plays,
      COALESCE(t.total_plays, 0) AS total_plays,
      COALESCE(p.avg_runs, 0) AS avg_runs,
      COALESCE(rt.rating, 0) AS rating,
      COALESCE(rt.rating_count, 0) AS rating_count,
      COALESCE(p.plays, 0) * (1.0 + COALESCE(p.avg_runs, 0)) * (1.0 + MIN(COALESCE(p.avg_dur, 0) / 60000.0, 5.0))
        + COALESCE(rt.rating, 0) * COALESCE(rt.rating_count, 0) * 3
        + CASE WHEN g.created_at > (unixepoch() * 1000 - 72 * 3600 * 1000) THEN 50 ELSE 0 END
        AS heat
    FROM games g
    LEFT JOIN (
      SELECT slug, COUNT(*) AS plays, AVG(runs) AS avg_runs, AVG(duration_ms) AS avg_dur
      FROM plays WHERE started_at > (unixepoch() * 1000 - 7 * 86400 * 1000)
      GROUP BY slug
    ) p ON p.slug = g.slug
    LEFT JOIN (
      SELECT slug, COUNT(*) AS total_plays FROM plays GROUP BY slug
    ) t ON t.slug = g.slug
    LEFT JOIN (
      SELECT slug, AVG(stars) AS rating, COUNT(*) AS rating_count FROM ratings GROUP BY slug
    ) rt ON rt.slug = g.slug
    WHERE g.status = 'published'
    ORDER BY heat DESC, g.created_at DESC
    LIMIT ?
  `
    )
    .all(limit) as FeedItem[];
  return rows;
}

export function getLeaderboard(slug: string, order: 'asc' | 'desc', window?: 'day', board = '') {
  const since = window === 'day' ? Date.now() - 86400_000 : 0;
  const agg = order === 'asc' ? 'MIN(score)' : 'MAX(score)';
  return db()
    .prepare(
      `SELECT name, ${agg} as score, MIN(created_at) as created_at FROM scores
       WHERE slug = ? AND board = ? AND quarantined = 0 AND created_at > ?
       GROUP BY name
       ORDER BY score ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT 10`
    )
    .all(slug, board, since) as { name: string; score: number; created_at: number }[];
}
