'use client';

// The build loop, drawn as a diagram: designer → builder → play-tester →
// judge, with the fix-cycle arrow curling back to the builder and the publish
// exit on the right. The ACTIVE stage shimmers; finished stages are inked;
// stages not yet reached sit faint. This is the hero of the build page — the
// trace below is the footnotes.
export type LoopStage = 'designer' | 'builder' | 'playtest' | 'judge';

const NODES: { key: LoopStage; name: string; desc: string }[] = [
  { key: 'designer', name: 'designer', desc: 'writes the brief' },
  { key: 'builder', name: 'builder', desc: 'writes the game' },
  { key: 'playtest', name: 'play-tester', desc: 'plays it for real' },
  { key: 'judge', name: 'judge', desc: 'scores the fun' },
];

export default function BuildLoop({
  stage,
  cycles,
  status,
}: {
  stage: LoopStage;
  cycles: number;
  status: 'running' | 'published' | 'failed';
}) {
  const activeIdx = NODES.findIndex((n) => n.key === stage);
  const state = (i: number) => {
    if (status !== 'running') return 'done';
    if (i < activeIdx || cycles > 1) return 'done'; // past cycle 1, everything has run at least once
    if (i === activeIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="loop-wrap" aria-label={`Build loop — currently ${status === 'running' ? NODES[activeIdx]?.name : status}`}>
      <div className="loop-row">
        {NODES.map((n, i) => (
          <div key={n.key} style={{ display: 'contents' }}>
            <div className={`loop-node ${state(i)}${status === 'running' && i === activeIdx ? ' active' : ''}`}>
              <div className="ln-name">{n.name}</div>
              <div className="ln-desc">{n.desc}</div>
            </div>
            {i < NODES.length - 1 && (
              <div className="loop-arrow" aria-hidden>
                ⟶
              </div>
            )}
          </div>
        ))}
      </div>

      {/* the return curve: judge → builder (fix cycle), plus the publish exit */}
      <div className="loop-under">
        <svg className="loop-return" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden>
          {/* from under the judge (x≈87) back to under the builder (x≈38) */}
          <path
            d="M 87 2 C 87 20, 38 20, 38 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
            strokeDasharray="1.6 1.1"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M 36.4 8 L 38 4.4 L 39.6 8" fill="none" stroke="currentColor" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={`loop-cycle mono${status === 'running' && cycles > 1 ? ' hot' : ''}`}>
          {status === 'running' && cycles > 1 ? `fix cycle ${cycles} of 3` : 'fix cycle · up to 3'}
        </span>
        <span
          className={`loop-exit${status === 'published' ? ' published' : ''}${status === 'failed' ? ' failed' : ''}`}
        >
          {status === 'failed' ? '↛ not published' : '→ published'}
        </span>
      </div>
    </div>
  );
}
