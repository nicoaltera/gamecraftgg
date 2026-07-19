import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto('http://localhost:3311/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.removeItem('gs_creations'));  // brand-new visitor
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
console.log('your-games link visible for NEW visitor (no creations):', await p.locator('.yours-link').count() === 1);
await p.goto('http://localhost:3311/yours', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(800);
console.log('empty-state /yours text:', (await p.locator('main').innerText()).replace(/\n+/g,' ').slice(0,120));
await b.close();
