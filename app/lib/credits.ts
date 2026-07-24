import { db } from './db';

// Credit economics (founder-set 2026-07-23): 100 credits = $1. Creating a
// game costs 1000 (= $10), editing costs 200 (= $2 — still below the pipeline's
// token cost per edit run, so watch iteration volume in /k once traffic lands).
// Signup grants 2000 (= two games). The ledger is append-only — balance is
// always derived, never stored, so there is no counter to corrupt and every
// credit movement has an audit row.
export const GENERATION_COST = 1000;
export const EDIT_COST = 200;
export const SIGNUP_GRANT = 2000;
// Earned when YOUR share link brings in a real new player (not a click — a
// converted play). Deduped per (sharer, game, player-IP) and capped daily:
// a genuine super-sharer earns a free game a day, a farmer earns nothing.
export const SHARE_REWARD = 100;
export const SHARE_REWARD_DAILY_CAP = 10;

export type CreditReason = 'signup_grant' | 'purchase' | 'debit' | 'refund' | 'share_reward';

export function balance(userId: string): number {
  const r = db()
    .prepare('SELECT COALESCE(SUM(delta), 0) AS bal FROM credit_entries WHERE user_id = ?')
    .get(userId) as { bal: number };
  return r.bal;
}

// Idempotent append: UNIQUE(reason, ref_id) makes replays (webhook retries,
// double-fired hooks) no-ops. Returns true iff a row was actually written.
export function addEntry(userId: string, delta: number, reason: CreditReason, refId: string): boolean {
  if (!refId) throw new Error('credit entries require a ref_id (idempotency key)');
  const res = db()
    .prepare(
      'INSERT OR IGNORE INTO credit_entries (user_id, delta, reason, ref_id, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(userId, delta, reason, refId, Date.now());
  return res.changes > 0;
}

export function grantSignupCredits(userId: string): void {
  addEntry(userId, SIGNUP_GRANT, 'signup_grant', userId);
}

// Refund whatever was debited for a generation — idempotent (the ledger's
// UNIQUE key), safe to call for runs that were never debited (CLI runs).
// This is THE refund path: workers can't touch money; they report `finish`
// and the app calls this.
export function refundForGeneration(genId: string): boolean {
  const deb = db()
    .prepare("SELECT user_id, delta FROM credit_entries WHERE reason = 'debit' AND ref_id = ?")
    .get(genId) as { user_id: string; delta: number } | undefined;
  if (!deb) return false;
  return addEntry(deb.user_id, -deb.delta, 'refund', genId);
}

export function entries(userId: string, limit = 50) {
  return db()
    .prepare('SELECT delta, reason, ref_id, created_at FROM credit_entries WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as { delta: number; reason: CreditReason; ref_id: string; created_at: number }[];
}
