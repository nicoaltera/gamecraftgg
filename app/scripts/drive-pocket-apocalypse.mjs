// Scripted drive for Pocket Apocalypse (coin-shop edition).
// Verifies the owner's three asks PLUS the preserved behaviors:
//   1. HOLD-to-fire: a single continuous key-hold (never re-pressed) keeps the
//      weapon firing at its cadence (lastFire advances repeatedly).
//   2. Coins are earned per kill and accumulate across the wave.
//   3. Shop opens between waves; buying a GUN changes the equipped weapon and
//      buying an UPGRADE spends coins + raises its level; NEXT WAVE resumes.
//   preserved: one-hit death, zombie health bars deplete, gs:'gameover' posts
//   the {waves,kills} map, retry returns to a FRESH wave-1 run with reset coins
//   and never auto-plays.
// Usage: node scripts/drive-pocket-apocalypse.mjs [port]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const port = Number(process.argv[2] || 8940);
const url = `http://localhost:${port}/play/pocket-apocalypse/`;
const shotDir = path.join('games', 'pocket-apocalypse', '_shots');
fs.mkdirSync(shotDir, { recursive: true });

const HARNESS = `window.__paWant=true;window.__gs={msgs:[]};window.addEventListener('message',e=>{if(e.data&&e.data.gs)window.__gs.msgs.push(e.data);});`;
const W = 960, H = 540;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(HARNESS);
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(600);

const snap = () => page.evaluate(() => window.__pa);
const msgs = () => page.evaluate(() => window.__gs.msgs);
async function metrics() {
  return page.evaluate(() => {
    const s = Math.min(window.innerWidth / 960, window.innerHeight / 540);
    return { s, ox: (window.innerWidth - 960 * s) / 2, oy: (window.innerHeight - 540 * s) / 2 };
  });
}
async function clickV(vx, vy) { const m = await metrics(); await page.mouse.click(m.ox + vx * m.s, m.oy + vy * m.s); }

// ---- start ----
await page.mouse.click(640, 360);
await page.waitForTimeout(400);

// ===== 1) HOLD-TO-FIRE PROOF: press Space ONCE and hold; lastFire must keep advancing =====
await page.keyboard.down('Space');
const fireStamps = [];
for (let i = 0; i < 16; i++) { const s = await snap(); if (s) fireStamps.push(s.lastFire); await page.waitForTimeout(120); }
await page.keyboard.up('Space');
const distinctFires = new Set(fireStamps.filter((x) => x > 0)).size;
const holdToFireWorks = distinctFires >= 3; // multiple shots from ONE continuous hold

// ---- kiting loop that holds fire the whole time (no re-clicks) ----
const held = new Set();
async function setKeys(want) {
  for (const k of held) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
}
const observed = { maxWave: 1, weapons: new Set(), sawDamaged: false, maxCoins: 0 };
await page.keyboard.down('Space'); // HOLD fire continuously — never re-pressed
async function playUntil(predicate, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await snap();
    if (s) {
      observed.maxWave = Math.max(observed.maxWave, s.wave);
      observed.weapons.add(s.weapon);
      observed.maxCoins = Math.max(observed.maxCoins, s.coins);
      if (s.zombies.some((z) => z.hp < z.maxhp)) observed.sawDamaged = true;
      if (predicate(s)) return s;
      if (s.state === 'over') return s;
      // steer away from nearest zombie, bias to center
      let nx = 0, ny = 0, nd = 1e9;
      for (const z of s.zombies) { const d = Math.hypot(z.x - s.px, z.y - s.py); if (d < nd) { nd = d; nx = z.x; ny = z.y; } }
      let dx = 0, dy = 0;
      if (nd < 1e9) { dx = (s.px - nx) / (nd || 1); dy = (s.py - ny) / (nd || 1); }
      dx += (W / 2 - s.px) * 0.01; dy += (H / 2 - s.py) * 0.01;
      const want = new Set();
      if (dx > 0.25) want.add('d'); else if (dx < -0.25) want.add('a');
      if (dy > 0.25) want.add('s'); else if (dy < -0.25) want.add('w');
      await setKeys(want);
    }
    await page.waitForTimeout(60);
  }
  return await snap();
}

// ===== 2/3) Clear wave 1 (earning coins) until the SHOP opens =====
const atShop = await playUntil((s) => s.phase === 'shop', 90000);
await setKeys(new Set());
await page.keyboard.up('Space'); // stop holding fire before shopping
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(shotDir, 'drive-1-shop.png') });

const beforeBuy = await snap();
const coinsAtShop = beforeBuy ? beforeBuy.coins : 0;

// buy the next gun on the ladder
let boughtGun = false, gunWeaponAfter = null;
if (beforeBuy && beforeBuy.shop && beforeBuy.nextWeapon >= 0) {
  const card = beforeBuy.shop.wc.find((c) => c.i === beforeBuy.nextWeapon);
  if (card) { await clickV(card.x + card.w / 2, card.y + card.h / 2); await page.waitForTimeout(250); }
  const afterGun = await snap();
  gunWeaponAfter = afterGun && afterGun.weapon;
  boughtGun = !!(afterGun && afterGun.owned[beforeBuy.nextWeapon] && afterGun.curWeapon === beforeBuy.nextWeapon && afterGun.coins < coinsAtShop);
}
await page.screenshot({ path: path.join(shotDir, 'drive-2-shop-bought.png') });

// press NEXT WAVE (Space in shop) -> wave 2 with the purchased weapon
await page.keyboard.press('Space');
await page.waitForTimeout(700);
const wave2 = await snap();
const resumedWithGun = !!(wave2 && wave2.wave === 2 && wave2.state === 'live' && wave2.phase !== 'shop');
const weaponAtW2 = wave2 && wave2.weapon;
await page.screenshot({ path: path.join(shotDir, 'drive-3-wave2-armed.png') });

// clear wave 2 with the new gun (holding fire) until the SHOP re-opens
await page.keyboard.down('Space');
const atShop2 = await playUntil((s) => s.wave >= 2 && s.phase === 'shop', 90000);
await setKeys(new Set());
await page.keyboard.up('Space');
await page.waitForTimeout(300);

// buy an upgrade (MOVE SPEED — first card) now that coins have accrued
let boughtUpgrade = false;
if (atShop2 && atShop2.shop) {
  const uc = atShop2.shop.uc[0]; // speed
  const coinsB = atShop2.coins, spdB = atShop2.up.speed;
  await clickV(uc.x + uc.w / 2, uc.y + uc.h / 2); await page.waitForTimeout(250);
  const afterUp = await snap();
  boughtUpgrade = !!(afterUp && afterUp.up.speed > spdB && afterUp.coins < coinsB);
}
await page.screenshot({ path: path.join(shotDir, 'drive-3b-shop2-upgrade.png') });

// NEXT WAVE -> wave 3, play a touch holding fire
await page.keyboard.press('Space');
await page.waitForTimeout(600);
await page.keyboard.down('Space');
await playUntil((s) => s.wave >= 3 && s.phase === 'fight', 30000);

// ===== force an honest one-hit death: stop, walk INTO the horde =====
await setKeys(new Set());
await page.keyboard.up('Space');
{
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    const s = await snap();
    if (!s || s.state === 'over') break;
    let nx = s.px, ny = s.py, nd = 1e9;
    for (const z of s.zombies) { const d = Math.hypot(z.x - s.px, z.y - s.py); if (d < nd) { nd = d; nx = z.x; ny = z.y; } }
    const want = new Set();
    if (nx > s.px + 6) want.add('d'); else if (nx < s.px - 6) want.add('a');
    if (ny > s.py + 6) want.add('s'); else if (ny < s.py - 6) want.add('w');
    await setKeys(want);
    await page.waitForTimeout(60);
  }
}
await setKeys(new Set());
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(shotDir, 'drive-4-fainted.png') });

const m1 = await msgs();
const go = [...m1].reverse().find((x) => x.gs === 'gameover');
const goCountBefore = m1.filter((x) => x.gs === 'gameover').length;

// ===== retry: Space -> fresh wave-1 run, coins reset, NO auto-play =====
await page.waitForTimeout(700);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const afterRetry = await snap();
const retryKills0 = afterRetry ? afterRetry.kills : -1;
await page.waitForTimeout(1500);
const afterIdle = await snap();
const m2 = await msgs();
const goCountAfter = m2.filter((x) => x.gs === 'gameover').length;

await browser.close();

console.log('\n=== POCKET APOCALYPSE DRIVE (coin-shop) ===');
console.log(' • HOLD-to-fire (one continuous hold, distinct shots):', distinctFires, '->', holdToFireWorks);
console.log(' • coins earned by shop time:', coinsAtShop, '(max seen', observed.maxCoins + ')');
console.log(' • shop opened between waves:', !!(atShop && atShop.phase === 'shop'));
console.log(' • bought a GUN -> weapon now:', gunWeaponAfter, '  ok:', boughtGun);
console.log(' • bought an UPGRADE (move speed):', boughtUpgrade);
console.log(' • resumed wave 2 armed with:', weaponAtW2, '  ok:', resumedWithGun);
console.log(' • zombie health bars depleted (hp<maxhp seen):', observed.sawDamaged);
console.log(' • gameover map:', JSON.stringify(go && go.scores));
console.log(' • retry -> fresh run:', afterRetry && afterRetry.state === 'live', 'wave=', afterRetry && afterRetry.wave, 'coins=', afterRetry && afterRetry.coins, 'weapon=', afterRetry && afterRetry.weapon);
console.log(' • retry NO auto-play: gameovers before=', goCountBefore, 'after-idle=', goCountAfter, '(equal) idle kills:', retryKills0, '->', afterIdle && afterIdle.kills);
console.log(' • console errors:', errors.length);
errors.slice(0, 8).forEach((e) => console.log('   ERR:', e.slice(0, 200)));

const ok = errors.length === 0 && holdToFireWorks && coinsAtShop > 0 && atShop && atShop.phase === 'shop'
  && boughtGun && boughtUpgrade && resumedWithGun && observed.sawDamaged
  && go && go.scores && typeof go.scores.waves === 'number' && typeof go.scores.kills === 'number'
  && afterRetry && afterRetry.state === 'live' && afterRetry.wave === 1 && afterRetry.coins === 0
  && goCountBefore === goCountAfter;
console.log('\nRESULT:', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
