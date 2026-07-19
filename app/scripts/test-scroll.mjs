import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 900, height: 500 } });
const p = await ctx.newPage();
await p.goto('http://localhost:3311/g/glowcave', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const y0 = await p.evaluate(() => window.scrollY);
for (let i=0;i<8;i++){ await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80); }
const y1 = await p.evaluate(() => window.scrollY);
const kg = await p.evaluate(() => window.__kg ?? 0);
const active = await p.evaluate(() => document.activeElement?.tagName);
console.log('scroll delta from keys:', y1 - y0, 'px | guard fired __kg =', kg, '| activeElement =', active);
console.log(y1===y0 ? 'FIXED ✓' : 'still scrolling ✗');
await b.close();
