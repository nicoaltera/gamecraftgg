'use client';

import { useState } from 'react';

export default function ReportButton({ slug }: { slug: string }) {
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');
  async function report() {
    if (state === 'sent') return;
    const reason = window.prompt('What is wrong with this game?') ?? '';
    if (reason === '') return;
    const sessionId = (window as { __gsSession?: string }).__gsSession;
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, sessionId, reason }),
      });
      // reflect the real outcome — a 403 (no play session yet) is not a success
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }
  return (
    <div className="report-row">
      {state === 'sent' ? (
        <span>Thanks — we will take a look.</span>
      ) : state === 'error' ? (
        <span>Couldn’t send that — play the game a moment, then try again.</span>
      ) : (
        <button onClick={report}>Report this game</button>
      )}
    </div>
  );
}
