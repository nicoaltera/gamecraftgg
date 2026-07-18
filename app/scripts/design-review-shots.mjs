// Design review screenshot harness — writes to /tmp/gs-review/
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const OUT = '/tmp/gs-review';
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3311';

const targets = [
  { name: 'home', url: `${BASE}/` },
  { name: 'game-glowcave-challenge', url: `${BASE}/g/glowcave?c=250` },
  { name: 'game-paper-pilot', url: `${BASE}/g/paper-pilot` },
  { name: 'game-crumble', url: `${BASE}/g/crumble` },
  { name: 'game-inkwell', url: `${BASE}/g/inkwell` },
  { name: 'game-milk-run', url: `${BASE}/g/milk-run` },
  { name: 'k-dashboard', url: `${BASE}/k` },
];

const mobileTargets = new Set(['home', 'game-glowcave-challenge']);

async function shoot(browser, ctxOpts, suffix, list) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  for (const t of list) {
    try {
      await page.goto(t.url, { waitUntil: 'networkidle', timeout: 20000 });
    } catch {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    }
    await page.waitForTimeout(1800); // let draw-in animations finish + fonts settle
    await page.screenshot({ path: `${OUT}/${t.name}-${suffix}-full.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/${t.name}-${suffix}-fold.png`, fullPage: false });
    console.log(`shot ${t.name} ${suffix}`);
  }
  // Focus-state probe on home (desktop only)
  if (suffix === 'desktop') {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    await page.screenshot({ path: `${OUT}/home-desktop-focus.png`, fullPage: false });
    // Hover a game card for hover state
    const card = page.locator('a[href^="/g/"]').first();
    if (await card.count()) {
      await card.hover().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/home-desktop-hover.png`, fullPage: false });
    }
  }
  if (consoleErrors.length) {
    fs.writeFileSync(`${OUT}/console-errors-${suffix}.txt`, consoleErrors.join('\n'));
  }
  await ctx.close();
}

const browser = await chromium.launch();
await shoot(browser, { viewport: { width: 1380, height: 900 }, deviceScaleFactor: 2 }, 'desktop', targets);
await shoot(browser, { ...devices['iPhone 13'] }, 'mobile', targets.filter((t) => mobileTargets.has(t.name)));
await browser.close();
console.log('done ->', OUT);
