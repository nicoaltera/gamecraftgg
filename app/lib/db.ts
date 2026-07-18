import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// SQLite for v1 (zero-infra local production). Schema is deliberately portable
// to Postgres — see 05-architecture.md; swap this module when hosting lands.

const DATA_DIR = path.join(process.cwd(), 'data');
const GAMES_DIR = path.join(process.cwd(), 'games');

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(path.join(DATA_DIR, 'gamesight.db'));
  _db.pragma('journal_mode = WAL');
  migrate(_db);
  syncGamesFromDisk(_db);
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
      palette TEXT DEFAULT '[]',
      author TEXT DEFAULT 'gamesight',
      status TEXT DEFAULT 'published',
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
    CREATE INDEX IF NOT EXISTS idx_scores_slug ON scores(slug, quarantined, score);
    CREATE INDEX IF NOT EXISTS idx_plays_slug ON plays(slug, started_at);
    CREATE INDEX IF NOT EXISTS idx_edges_slug ON referral_edges(slug, kind);
  `);
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
  const upsert = d.prepare(`
    INSERT INTO games (slug, title, description, verb, dials, orientation, mode, score_label, score_order, palette, author, created_at)
    VALUES (@slug, @title, @description, @verb, @dials, @orientation, @mode, @scoreLabel, @scoreOrder, @palette, @author, @createdAt)
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title, description=excluded.description, verb=excluded.verb,
      dials=excluded.dials, orientation=excluded.orientation, mode=excluded.mode,
      score_label=excluded.score_label, score_order=excluded.score_order, palette=excluded.palette
  `);
  for (const slug of fs.readdirSync(GAMES_DIR)) {
    const metaPath = path.join(GAMES_DIR, slug, 'meta.json');
    const htmlPath = path.join(GAMES_DIR, slug, 'index.html');
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
        palette: JSON.stringify(meta.palette ?? []),
        author: meta.author ?? 'gamesight',
        createdAt: fs.statSync(htmlPath).mtimeMs | 0,
      });
    } catch {
      // a malformed meta.json never takes the site down; the game just stays unlisted
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
  palette: string;
  author: string;
  status: string;
  created_at: number;
};

export function getGame(slug: string): GameRow | undefined {
  return db().prepare('SELECT * FROM games WHERE slug = ? AND status = ?').get(slug, 'published') as GameRow | undefined;
}

export type FeedItem = GameRow & { plays: number; avg_runs: number; heat: number };

// Retention-ranked feed: plays weighted by how much people replay and stick,
// with a freshness boost so new games get their exposure window (01-product-spec).
export function getFeed(limit = 24): FeedItem[] {
  const rows = db()
    .prepare(
      `
    SELECT g.*,
      COALESCE(p.plays, 0) AS plays,
      COALESCE(p.avg_runs, 0) AS avg_runs,
      COALESCE(p.plays, 0) * (1.0 + COALESCE(p.avg_runs, 0)) * (1.0 + MIN(COALESCE(p.avg_dur, 0) / 60000.0, 5.0))
        + CASE WHEN g.created_at > (unixepoch() * 1000 - 72 * 3600 * 1000) THEN 50 ELSE 0 END
        AS heat
    FROM games g
    LEFT JOIN (
      SELECT slug, COUNT(*) AS plays, AVG(runs) AS avg_runs, AVG(duration_ms) AS avg_dur
      FROM plays WHERE started_at > (unixepoch() * 1000 - 7 * 86400 * 1000)
      GROUP BY slug
    ) p ON p.slug = g.slug
    WHERE g.status = 'published'
    ORDER BY heat DESC, g.created_at DESC
    LIMIT ?
  `
    )
    .all(limit) as FeedItem[];
  return rows;
}

export function getLeaderboard(slug: string, order: 'asc' | 'desc', window?: 'day') {
  const since = window === 'day' ? Date.now() - 86400_000 : 0;
  const agg = order === 'asc' ? 'MIN(score)' : 'MAX(score)';
  return db()
    .prepare(
      `SELECT name, ${agg} as score, MIN(created_at) as created_at FROM scores
       WHERE slug = ? AND quarantined = 0 AND created_at > ?
       GROUP BY name
       ORDER BY score ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT 10`
    )
    .all(slug, since) as { name: string; score: number; created_at: number }[];
}
