import { db } from './db';

// Credit economics (plans/production-stack/PLAN.md): one generation or edit
// costs 100 credits; signup grants 200 (= two games, enough to feel the loop).
// The ledger is append-only — balance is always derived, never stored, so
// there is no counter to corrupt and every credit movement has an audit row.
export const GENERATION_COST = 100;
export const SIGNUP_GRANT = 200;

export type CreditReason = 'signup_grant' | 'purchase' | 'debit' | 'refund';

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

export function entries(userId: string, limit = 50) {
  return db()
    .prepare('SELECT delta, reason, ref_id, created_at FROM credit_entries WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as { delta: number; reason: CreditReason; ref_id: string; created_at: number }[];
}
