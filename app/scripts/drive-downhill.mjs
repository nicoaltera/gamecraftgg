// Scripted drive for Downhill's redesign.
// (a) theme gallery: draw-phase shot of every hill (varied backdrops/gimmicks),
// (b) a real ride on hill 1 (draw a track -> GO -> reach the flag),
// (c) a wipeout that drops back to DRAW with your lines KEPT (no hard reset),
// (d) gameover fires via Escape.  Usage: node scripts/drive-downhill.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8938);
const base = `http://localhost:${port}/play/downhill/`;
const shotDir = path.join('games', 'downhill', '_shots');
fs.mkdirSync(shotDir, { recursive: true });
const HARNESS = `window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const S = 1280 / 960; // virtual->client scale at 1280x720 (offsets are 0)
const cx = (vx) => vx * S, cy = (vy) => vy * S;

async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(HARNESS);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  return { page, ctx, errors };
}
const msgs = (page) => page.evaluate(() => window.__gs.msgs);

// draw a polyline (virtual coords) as one biro stroke
async function draw(page, pts) {
  await page.mouse.move(cx(pts[0][0]), cy(pts[0][1]));
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) await page.mouse.move(cx(pts[i][0]), cy(pts[i][1]), { steps: 6 });
  await page.mouse.up();
}

const allErrors = [];
const notes = [];
const browser = await chromium.launch();

// ---- (a) theme gallery: one draw-phase shot per hill ----
for (let lvl = 1; lvl <= 8; lvl++) {
  const { page, errors } = await open(browser, `${base}?lvl=${lvl}`);
  await page.keyboard.press('Space');          // splash -> draw
  await page.waitForTimeout(700);              // let the level banner ease in
  await page.screenshot({ path: path.join(shotDir, `hill-${lvl}.png`) });
  allErrors.push(...errors);
  await page.context().close();
}

// ---- (b) real ride on hill 1: draw a bridging track, GO, reach the flag ----
{
  const { page, errors } = await open(browser, `${base}?lvl=1`);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  // bridge the gap from the start-slope end (~330,278) across to the right shelf (~600,300),
  // arcing up through the star at (430,236) for a full-marks run.
  await draw(page, [[300, 264], [372, 252], [430, 244], [500, 262], [560, 288], [612, 300]]);
  await page.screenshot({ path: path.join(shotDir, 'ride-0-drawn.png') });
  await page.keyboard.press('Space');          // GO
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(shotDir, 'ride-1-riding.png') });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(shotDir, 'ride-2-riding.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(shotDir, 'ride-3-result.png') }); // WIN overlay or later ride
  const m = await msgs(page);
  notes.push(`hill1 ride: bridge messages = [${m.map((x) => x.gs + (x.score != null ? ':' + x.score : '')).join(', ')}]`);
  allErrors.push(...errors);
  await page.context().close();
}

// ---- (c) wipeout keeps your lines: draw a stub that does NOT bridge, GO, fall in ----
{
  const { page, errors } = await open(browser, `${base}?lvl=1`);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await draw(page, [[300, 268], [360, 300], [410, 330]]); // a stub into the pit
  await page.screenshot({ path: path.join(shotDir, 'wipe-0-drawn.png') });
  await page.keyboard.press('Space');          // GO
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shotDir, 'wipe-1-tumble.png') }); // comedic fall
  await page.waitForTimeout(1400);             // FAIL auto-returns to DRAW (lines kept)
  await page.screenshot({ path: path.join(shotDir, 'wipe-2-backtodraw.png') }); // GO/Undo/Clear + line still there
  // gameover via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const m = await msgs(page);
  const go = m.filter((x) => x.gs === 'gameover');
  notes.push(`wipeout+escape: gameover count = ${go.length} (score ${go.map((x) => x.score).join(',')})`);
  allErrors.push(...errors);
  await page.context().close();
}

await browser.close();
console.log('\n=== DOWNHILL DRIVE ===');
notes.forEach((n) => console.log(' •', n));
console.log(`console errors: ${allErrors.length}`);
allErrors.slice(0, 10).forEach((e) => console.log('  ERR:', e.slice(0, 200)));
process.exit(allErrors.length ? 1 : 0);
