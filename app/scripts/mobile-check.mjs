import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext(devices['iPhone 13']);
const p = await ctx.newPage();
await p.goto('http://localhost:3311/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/gs-mobile-home2.png', fullPage: true });
await b.close();
console.log('done');
