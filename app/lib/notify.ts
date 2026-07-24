import { db } from './db';
import { emailCreatorLive, emailCreatorFailed, emailFriendInvite, mailEnabled } from './mail';

// Fire the completion emails for a finished build, exactly once. Runs app-side
// (the mail key never reaches a worker). Best-effort: a mail failure never
// affects the build's real outcome. Idempotent via the `notified` flag.
export async function notifyOnFinish(genId: string): Promise<void> {
  if (!mailEnabled()) return;
  const gen = db()
    .prepare('SELECT id, slug, prompt, status, user_id, notify_emails, notified FROM generations WHERE id = ?')
    .get(genId) as
    | { id: string; slug: string | null; prompt: string; status: string; user_id: string; notify_emails: string; notified: number }
    | undefined;
  if (!gen || gen.notified || gen.status === 'running') return;

  // claim the send first, so a re-fired finish can't double-mail
  const claim = db().prepare("UPDATE generations SET notified = 1 WHERE id = ? AND notified = 0").run(genId);
  if (claim.changes === 0) return;

  try {
    const creator = gen.user_id
      ? (db().prepare('SELECT email, name FROM user WHERE id = ?').get(gen.user_id) as { email: string; name: string } | undefined)
      : undefined;

    if (gen.status === 'published' && gen.slug) {
      const game = db().prepare('SELECT title FROM games WHERE slug = ?').get(gen.slug) as { title: string } | undefined;
      const title = game?.title ?? gen.slug;
      if (creator?.email) await emailCreatorLive(creator.email, title, gen.slug);
      let friends: string[] = [];
      try {
        friends = JSON.parse(gen.notify_emails || '[]');
      } catch {
        /* malformed list — skip friend invites, creator still got theirs */
      }
      const maker = creator?.name ?? 'A friend';
      for (const f of friends.slice(0, 3)) {
        if (f && f !== creator?.email) await emailFriendInvite(f, maker, title, gen.slug, gen.user_id);
      }
    } else if (gen.status === 'failed' && creator?.email) {
      await emailCreatorFailed(creator.email, gen.prompt);
    }
  } catch (e) {
    console.error('[notify]', e); // already marked notified — we don't retry, mail is best-effort
  }
}
