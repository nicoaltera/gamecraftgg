'use client';

import { useState } from 'react';

export default function ReportButton({ slug }: { slug: string }) {
  const [state, setState] = useState<'idle' | 'sent'>('idle');
  async function report() {
    if (state === 'sent') return;
    const reason = window.prompt('What is wrong with this game?') ?? '';
    if (reason === '') return;
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, reason }),
    }).catch(() => {});
    setState('sent');
  }
  return (
    <div className="report-row">
      {state === 'sent' ? <span>Thanks — we will take a look.</span> : <button onClick={report}>Report this game</button>}
    </div>
  );
}
