import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto('http://localhost:3311/', { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.setItem('gs_creations', JSON.stringify([
  { id: 'testbuild01', prompt: 'a robot chef flipping pancakes', ts: Date.now() },
  { id: 'testdone01', prompt: 'a neon snake in a maze', ts: Date.now()-1000 },
])));
await p.goto('http://localhost:3311/yours', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.screenshot({ path: '/tmp/gs-yours.png' });
const txt = (await p.locator('main').innerText()).replace(/\n+/g,' | ');
console.log('YOURS PAGE:', txt.slice(0, 500));
await b.close();
