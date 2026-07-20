// Scripted full-loop drive for best-in-show: plays a whole show by timing correct
// inputs against the game's debug hook, proves gs:'gameover' + termination, then
// buys an accessory and screenshots the pup wearing it.
// Usage: node scripts/_drive-best-in-show.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8973);
const url = `http://localhost:${port}/play/best-in-show/`;
const shotDir = path.join('games', 'best-in-show', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  window.__msgs = [];
  window.addEventListener('message', (e) => { if (e.data && e.data.gs) window.__msgs.push(e.data); });
  try { localStorage.setItem('gs_save:best-in-show', JSON.stringify({ coins: 500, own: {}, best: 0, shows: 0, tier: 0 })); } catch (_) {}
});
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

// start
await page.mouse.click(640, 360);
await page.waitForTimeout(200);

const SCALE = 720 / 540; // desktop letterbox scale, offX=offY=0

async function playShow() {
  let guard = 0;
  while (guard++ < 500) {
    const s = await page.evaluate(() => window.__bis);
    if (!s) { await page.waitForTimeout(50); continue; }
    if (s.phase === 'result') return s;
    if (s.phase === 'cue' && s.cue && !s.cue.resolved) {
      const c = s.cue;
      if (c.type === 'trick') {
        const idx = s.tricks.indexOf(c.trick);
        const digit = String(idx + 1);
        const wait = Math.max(0, (c.beat - s.now) * 1000 - 25);
        await page.waitForTimeout(Math.min(wait, 2000));
        await page.keyboard.press(digit);
      } else if (c.type === 'pose') {
        await page.keyboard.down(' ');
        await page.waitForTimeout(1050);
        await page.keyboard.up(' ');
      } else if (c.type === 'groom') {
        await page.keyboard.down(' ');
        await page.waitForTimeout(1300);
        await page.keyboard.up(' ');
      }
      await page.waitForTimeout(140);
    } else {
      await page.waitForTimeout(60);
    }
  }
  return await page.evaluate(() => window.__bis);
}

const res = await playShow();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(shotDir, 'drive-1-result.png') });

const msgs = await page.evaluate(() => window.__msgs);
const gameover = msgs.filter((m) => m.gs === 'gameover');
const finalState = await page.evaluate(() => window.__bis);
console.log('phase after show:', res && res.phase, '| final score:', finalState && finalState.score, '| coins:', finalState && finalState.coins);
console.log('gameover msgs:', JSON.stringify(gameover));

// open shop
await page.keyboard.press('s');
await page.waitForTimeout(400);
// buy bow_red (index 1 of not-owned list): col=1,row=0
const bx = 24 + 1 * (386 + 18) + 386 - 78 - 8, by = 100 + 0 + 8;
await page.mouse.click((bx + 39) * SCALE, (by + 17) * SCALE);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(shotDir, 'drive-2-shop-bought.png') });
const owned = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('gs_save:best-in-show')).own));
console.log('owned after buy:', JSON.stringify(owned));

// back to result, start a new show, screenshot pup wearing the bow
await page.keyboard.press(' '); // back to result
await page.waitForTimeout(300);
await page.keyboard.press(' '); // perform again
await page.waitForTimeout(900); // during walkin
await page.screenshot({ path: path.join(shotDir, 'drive-3-pup-accessory.png') });

console.log('console errors:', errors.length);
errors.slice(0, 5).forEach((e) => console.log('  ERR:', e.slice(0, 200)));
await browser.close();

const ok = gameover.length > 0 && gameover[0].score > 0 && res && res.phase === 'result' && owned.includes('bow_red') && errors.length === 0;
console.log(ok ? '\nDRIVE PASS ✔  (show terminated, gameover posted a score, accessory bought)' : '\nDRIVE FAIL ✘');
process.exit(ok ? 0 : 1);
