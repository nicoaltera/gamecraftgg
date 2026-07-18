import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// The K dashboard (01-product-spec.md): the experiment's decision gate.
// K = shares-per-player x share->player conversion, per 7-day window.
export default function KDashboard() {
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
