// Sighted autopilot: steers to cave center via the game's read-only debug hook.
// Verifies depth window (M4/M5) and captures deep-run art screenshots.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', m => m.type() === 'error' && console.log('ERR', m.text()));
page.on('pageerror', e => console.log('PAGEERR', String(e)));
await page.addInitScript(`window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data)});`);
await page.goto('http://localhost:8901/play/glowcave/?c=150', { waitUntil: 'load' });
await page.waitForTimeout(500);
await page.keyboard.down('Space'); // start
let held = true;
const t0 = Date.now();
const shots = [[8000, 'probe2-8s'], [20000, 'probe2-20s'], [40000, 'probe2-40s'], [60000, 'probe2-60s']];
let si = 0, maxDist = 0, deaths = 0, lastState = 'run';
while (Date.now() - t0 < 70000) {
  const st = await page.evaluate(() => window.__gcdebug());
  maxDist = Math.max(maxDist, st.dist);
  if (st.state === 'dead') {
    if (lastState !== 'dead') { deaths++; console.log(`death #${deaths} at ${st.dist.toFixed(0)}m, t=${((Date.now()-t0)/1000).toFixed(1)}s`); }
    lastState = 'dead';
    if (held) { await page.keyboard.up('Space'); held = false; }
    await page.waitForTimeout(500);
    await page.keyboard.press('Space'); // retry
    await page.waitForTimeout(80);
    continue;
  }
  lastState = st.state;
  // aim slightly above center; hold if below aim
  const aim = (st.top + st.bot) / 2;
  const wantHold = st.y > aim - 4;
  if (wantHold !== held) { if (wantHold) await page.keyboard.down('Space'); else await page.keyboard.up('Space'); held = wantHold; }
  if (si < shots.length && Date.now() - t0 > shots[si][0]) {
    await page.screenshot({ path: 'games/glowcave/_shots/' + shots[si][1] + '.png' });
    si++;
  }
  await page.waitForTimeout(30);
}
const msgs = await page.evaluate(() => window.__gs.msgs);
console.log('max dist:', maxDist.toFixed(0), 'm; deaths:', deaths, '; challenge_beaten:', msgs.some(m=>m.gs==='challenge_beaten'));
await browser.close();
