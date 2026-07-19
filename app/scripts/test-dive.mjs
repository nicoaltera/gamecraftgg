import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
await p.goto('http://localhost:3311/g/paper-pilot', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('iframe.game-stage').click();       // focus the game
// charge + release a throw
await p.keyboard.down('Space'); await p.waitForTimeout(500); await p.keyboard.up('Space');
await p.waitForTimeout(700);
// hold DIVE (ArrowDown) for a good while
await p.keyboard.down('ArrowDown'); await p.waitForTimeout(1400);
await p.screenshot({ path: '/tmp/pp-dive.png' });
await p.keyboard.up('ArrowDown');
console.log('dive screenshot captured');
await b.close();
