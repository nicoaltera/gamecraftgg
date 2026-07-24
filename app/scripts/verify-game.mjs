// Play-evidence harness for a single game. Loads the game on desktop and mobile
// viewports, records console errors, bridge messages, and screenshots.
// Usage (from the app directory, with game-server running on PORT):
//   node scripts/verify-game.mjs <slug> [port]
// Screenshots land in games/<slug>/_shots/. Exit code 1 on hard failures.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const slug = process.argv[2];
const port = Number(process.argv[3] || 8900);
if (!slug) {
  console.error('usage: node scripts/verify-game.mjs <slug> [port]');
  process.exit(2);
}
const url = `http://localhost:${port}/play/${slug}/`;
const shotDir = path.join('games', slug, '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `
  window.__gs = { msgs: [], errors: [] };
  window.addEventListener('message', (e) => { if (e.data && e.data.gs) window.__gs.msgs.push(e.data); });
`;

async function run(name, contextOpts, interact) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  // The harness listens on the top window; games post to parent — when the game
  // IS the top window, parent === window, so messages arrive here.
  await page.addInitScript(HARNESS);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, `${name}-1-loaded.png`) });
  await interact(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(shotDir, `${name}-2-playing.png`) });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(shotDir, `${name}-3-later.png`) });
  const msgs = await page.evaluate(() => window.__gs.msgs);
  await browser.close();
  return { name, errors, msgs };
}

const results = [];
results.push(
  await run('desktop', { viewport: { width: 1280, height: 720 } }, async (page) => {
    await page.keyboard.press('Space');
    await page.mouse.click(640, 360);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.down('Space');
      await page.waitForTimeout(180);
      await page.keyboard.up('Space');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(140);
    }
  })
);
results.push(
  await run('mobile', { ...devices['iPhone 13'] }, async (page) => {
    // Exercise the full touch vocabulary so drag/hold-based controls actually
    // fire and the "playing" screenshot reflects real touch — not just taps.
    // (Pass criteria are unchanged: no console errors + a gs:'ready' bridge.)
    await page.touchscreen.tap(195, 422); // start / primary
    // a vertical drag in the left thumb-zone (pitch/steer/throttle-style controls)
    for (const [x, y0, y1] of [[110, 300, 520], [110, 520, 300]]) {
      await page.touchscreen.tap(x, y0);
      await page.mouse.move(x, y0);
      await page.mouse.down();
      for (let s = 0; s <= 6; s++) {
        await page.mouse.move(x, y0 + ((y1 - y0) * s) / 6);
        await page.waitForTimeout(60);
      }
      await page.mouse.up();
    }
    // tap bursts on the right (fire/boost) + a couple of general taps
    for (let i = 0; i < 8; i++) {
      await page.touchscreen.tap(280 + (i % 3) * 30, 500);
      await page.waitForTimeout(220);
    }
  })
);

let fail = false;
for (const r of results) {
  const ready = r.msgs.some((m) => m.gs === 'ready');
  console.log(`\n[${r.name}] console errors: ${r.errors.length}`);
  r.errors.slice(0, 8).forEach((e) => console.log('  ERR:', e.slice(0, 300)));
  console.log(`[${r.name}] bridge messages:`, r.msgs.map((m) => m.gs + (m.score != null ? `:${m.score}` : '')).join(', ') || '(none)');
  if (r.errors.length) fail = true;
  if (!ready) {
    console.log(`[${r.name}] MISSING gs:'ready' message`);
    fail = true;
  }
}
console.log(`\nScreenshots: ${shotDir}/  — LOOK at them. Blank/black frames, default fonts, or popped-in UI are failures the harness cannot see.`);
process.exit(fail ? 1 : 0);
