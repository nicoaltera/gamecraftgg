// A stable per-browser id used as the (login-less) creator/rater identity.
// Same key GameStage uses for referral edges.
export function getRef(): string {
  if (typeof window === 'undefined') return '';
  let r = localStorage.getItem('gs_ref_id');
  if (!r) {
    r = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('gs_ref_id', r);
  }
  return r;
}
