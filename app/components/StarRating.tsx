'use client';

import { useEffect, useState } from 'react';
import { getRef } from '@/lib/ref';

// Half-star ratings (0.5–5). Click the left/right half of a star to pick.
function Stars({ value, onPick }: { value: number; onPick?: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="stars" onMouseLeave={() => setHover(0)} role={onPick ? 'slider' : undefined} aria-label="rating">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = shown >= i;
        const half = !full && shown >= i - 0.5;
        return (
          <span key={i} className="star-wrap">
            <span className={`star ${full ? 'full' : half ? 'half' : ''}`}>★</span>
            {onPick && (
              <>
                <button className="star-hit left" aria-label={`${i - 0.5} stars`} onMouseEnter={() => setHover(i - 0.5)} onClick={() => onPick(i - 0.5)} />
                <button className="star-hit right" aria-label={`${i} stars`} onMouseEnter={() => setHover(i)} onClick={() => onPick(i)} />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}

export default function StarRating({ slug }: { slug: string }) {
  const [avg, setAvg] = useState(0);
  const [count, setCount] = useState(0);
  const [yours, setYours] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/rate?slug=${slug}&ref=${getRef()}`)
      .then((r) => r.json())
      .then((d) => {
        setAvg(d.avg ?? 0);
        setCount(d.count ?? 0);
        setYours(d.yours ?? null);
      })
      .catch(() => {});
  }, [slug]);

  async function rate(v: number) {
    setYours(v);
    const res = await fetch('/api/rate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ref: getRef(), stars: v }),
    });
    const d = await res.json();
    if (res.ok) {
      setAvg(d.avg ?? 0);
      setCount(d.count ?? 0);
    }
  }

  return (
    <div className="rating">
      <div className="rating-avg">
        <Stars value={avg} />
        <span className="rating-num mono">{count > 0 ? `${avg.toFixed(1)} · ${count}` : 'no ratings yet'}</span>
      </div>
      <div className="rating-you">
        <span>{yours ? 'your rating' : 'rate it'}</span>
        <Stars value={yours ?? 0} onPick={rate} />
      </div>
    </div>
  );
}
