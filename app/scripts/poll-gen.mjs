// Polls the latest generation's trace until it has streamed events (proving the
// live agent-loop feed works) or the generation finishes. Prints a summary.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const d = new Database('data/gamesight.db');
const id = fs.readFileSync('/tmp/gs-gid.txt', 'utf8').trim();

const deadline = Date.now() + 20 * 60 * 1000;
function snapshot() {
  const g = d.prepare('SELECT status, slug, trace FROM generations WHERE id = ?').get(id);
  const ev = JSON.parse(g.trace || '[]');
  return { status: g.status, slug: g.slug, ev };
}
async function main() {
  for (;;) {
    const { status, slug, ev } = snapshot();
    const streamed = ev.filter((e) => e.stream);
    const kinds = {};
    for (const e of streamed) kinds[e.stream] = (kinds[e.stream] || 0) + 1;
    if (streamed.length >= 5 || status !== 'running') {
      console.log(`status=${status} slug=${slug || '(none)'} total_events=${ev.length} streamed=${streamed.length}`, JSON.stringify(kinds));
      console.log('--- sample streamed events ---');
      for (const e of streamed.slice(0, 8)) console.log(`  [${e.kind}/${e.stream}] ${e.detail.slice(0, 90)}`);
      if (status !== 'running') console.log(`FINAL: ${status}`);
      return;
    }
    if (Date.now() > deadline) {
      console.log('timeout waiting for stream events; total events:', ev.length);
      return;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
main();
