import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Admin-only: this page shows prompts, spend, and worker internals. Gated on
// ADMIN_EMAILS (comma-separated, a Fly secret); open in local dev for
// convenience; 404 (not 403) so the URL doesn't advertise itself.
async function requireAdmin() {
  if (process.env.NODE_ENV !== 'production') return;
  const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !admins.includes(session.user.email.toLowerCase())) notFound();
}

// Fleet observability: every build in the last 24h — status, worker machine,
// cycles, spend, and (for live builds) how long since the worker last spoke.
// "Silent >5 min" is the pre-reaper warning shade.
function BuildsPanel() {
  const now = Date.now();
  const builds = db()
    .prepare(
      `SELECT id, slug, prompt, status, cycles, cost, worker_machine, created_at, updated_at
       FROM generations WHERE created_at > ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(now - 86400_000) as {
    id: string; slug: string | null; prompt: string; status: string; cycles: number;
    cost: string; worker_machine: string; created_at: number; updated_at: number;
  }[];
  const running = builds.filter((b) => b.status === 'running').length;

  return (
    <>
      <div className="feed-head" style={{ marginTop: 44 }}>
        <h2>Builds — last 24h</h2>
        <span className="rule" />
        <span className="feed-note">{running} running · cap {process.env.GC_MAX_CONCURRENT || 2} · {process.env.GC_DISPATCH === 'machines' ? 'fleet' : 'local'} dispatch</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, maxWidth: 980 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--graphite)', fontSize: 12.5 }}>
            <th style={{ padding: '6px 2px' }}>prompt</th>
            <th>status</th>
            <th>cycles</th>
            <th>spend</th>
            <th>machine</th>
            <th>age</th>
            <th>last event</th>
          </tr>
        </thead>
        <tbody>
          {builds.map((b) => {
            const silent = Math.round((now - b.updated_at) / 60000);
            let spend = '—';
            try {
              const c = JSON.parse(b.cost || '{}');
              if (c.total) spend = `$${c.total.toFixed(2)}`;
            } catch { /* unparsed cost never breaks the panel */ }
            const color = b.status === 'failed' ? 'var(--redpencil)' : b.status === 'published' ? 'var(--ink)' : 'var(--biro)';
            return (
              <tr key={b.id} style={{ borderTop: '1px solid rgba(26,24,21,0.14)', background: b.status === 'running' && silent > 5 ? 'rgba(217,72,43,0.06)' : 'transparent' }}>
                <td style={{ padding: '7px 2px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.prompt}</td>
                <td className="mono" style={{ color }}>{b.status}</td>
                <td className="mono">{b.cycles || '—'}</td>
                <td className="mono">{spend}</td>
                <td className="mono">{b.worker_machine || 'local'}</td>
                <td className="mono">{Math.round((now - b.created_at) / 60000)}m</td>
                <td className="mono">{b.status === 'running' ? `${silent}m ago` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

// The K dashboard (01-product-spec.md): the experiment's decision gate.
// K = shares-per-player x share->player conversion, per 7-day window.
export default async function KDashboard() {
  await requireAdmin();
  const d = db();
  const now = Date.now();
  const week = now - 7 * 86400_000;

  const players = (d.prepare('SELECT COUNT(DISTINCT session_id) c FROM plays WHERE started_at > ?').get(week) as { c: number }).c;
  const shares = (d.prepare("SELECT COUNT(*) c FROM referral_edges WHERE kind = 'share' AND created_at > ?").get(week) as { c: number }).c;
  const referredPlays = (d.prepare("SELECT COUNT(*) c FROM referral_edges WHERE kind = 'play' AND created_at > ?").get(week) as { c: number }).c;
  const sharesPerPlayer = players ? shares / players : 0;
  const conversion = shares ? referredPlays / shares : 0;
  const k = sharesPerPlayer * conversion;

  const byGame = d
    .prepare(
      `SELECT g.slug, g.title,
        (SELECT COUNT(*) FROM plays p WHERE p.slug = g.slug AND p.started_at > ?) plays,
        (SELECT COUNT(*) FROM referral_edges e WHERE e.slug = g.slug AND e.kind = 'share' AND e.created_at > ?) shares,
        (SELECT COUNT(*) FROM referral_edges e WHERE e.slug = g.slug AND e.kind = 'play' AND e.created_at > ?) referred
       FROM games g WHERE g.status = 'published'
       ORDER BY plays DESC`
    )
    .all(week, week, week) as { slug: string; title: string; plays: number; shares: number; referred: number }[];

  const stat = (label: string, value: string, note?: string) => (
    <div style={{ border: '1.5px solid var(--ink)', borderRadius: 8, padding: '18px 22px', minWidth: 180 }}>
      <div style={{ color: 'var(--graphite)', fontSize: 13 }}>{label}</div>
      <div className="mono" style={{ fontSize: 34, marginTop: 4 }}>{value}</div>
      {note && <div style={{ color: 'var(--graphite)', fontSize: 12, marginTop: 4 }}>{note}</div>}
    </div>
  );

  return (
    <main className="game-page">
      <h1 className="display" style={{ fontSize: 30 }}>
        K — last 7 days
      </h1>
      <p className="about-game" style={{ margin: '8px 0 24px' }}>
        The experiment graduates when K approaches 1 in any cohort. K = shares per player × share→player conversion.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {stat('K', k.toFixed(3), 'the number')}
        {stat('players', players.toLocaleString())}
        {stat('dares shared', shares.toLocaleString())}
        {stat('shares / player', sharesPerPlayer.toFixed(2))}
        {stat('share → play conversion', `${(conversion * 100).toFixed(0)}%`)}
      </div>

      <BuildsPanel />

      <div className="feed-head" style={{ marginTop: 44 }}>
        <h2>By game</h2>
        <span className="rule" />
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, maxWidth: 720 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--graphite)', fontSize: 13 }}>
            <th style={{ padding: '6px 2px' }}>game</th>
            <th>plays</th>
            <th>dares</th>
            <th>referred plays</th>
          </tr>
        </thead>
        <tbody>
          {byGame.map((g) => (
            <tr key={g.slug} style={{ borderTop: '1px solid rgba(26,24,21,0.14)' }}>
              <td style={{ padding: '8px 2px' }}>{g.title}</td>
              <td className="mono">{g.plays}</td>
              <td className="mono">{g.shares}</td>
              <td className="mono">{g.referred}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
