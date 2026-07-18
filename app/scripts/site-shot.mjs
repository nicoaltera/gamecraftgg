import { chromium, devices } from 'playwright';
const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1380, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => m.type() === 'error' && errs.push(m.text()));
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://localhost:3311/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/gs-home-${name}.png`, fullPage: true });
  console.log(name, 'errors:', errs.length, errs.slice(0,3));
  await ctx.close();
}
await browser.close();
