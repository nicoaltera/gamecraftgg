import { chromium, devices } from 'playwright';
const slug = process.argv[2] || 'glowcave';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://localhost:3311/g/${slug}?c=250`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `/tmp/gs-game-${slug}.png` });
// play a bit inside the iframe: hold space via keyboard on the iframe
const frame = page.frames().find(f => f.url().includes(`/play/${slug}`));
console.log('iframe found:', !!frame);
await page.locator('iframe.game-stage').click();
for (let i = 0; i < 14; i++) { await page.keyboard.down('Space'); await page.waitForTimeout(200); await page.keyboard.up('Space'); await page.waitForTimeout(150); }
await page.waitForTimeout(6000); // likely dies -> gameover fires
await page.screenshot({ path: `/tmp/gs-game-${slug}-after.png` });
console.log('page errors:', errs.length, errs.slice(0, 4));
await browser.close();
