import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errs = [];
p.on('console', m => m.type() === 'error' && errs.push(m.text()));
p.on('pageerror', e => errs.push(String(e)));

// 1. home -> click first game card
await p.goto('http://localhost:3311/', { waitUntil: 'networkidle' });
await p.locator('.game-card').first().click();
await p.waitForURL(/\/g\//);
await p.waitForTimeout(1500);

// 2. play the game inside iframe (glowcave = hold space)
await p.locator('iframe.game-stage').click();
for (let i=0;i<10;i++){ await p.keyboard.down('Space'); await p.waitForTimeout(180); await p.keyboard.up('Space'); await p.waitForTimeout(140); }
await p.waitForTimeout(5000); // die -> gameover -> name-pop appears

// 3. submit a score
const nameInput = p.locator('.name-pop input');
if (await nameInput.count()) {
  await nameInput.fill('flowtest');
  await p.locator('.name-pop button').click();
  await p.waitForTimeout(1200);
}
// 4. leaderboard shows it?
const boardText = await p.locator('.board').innerText();
console.log('LEADERBOARD:', boardText.replace(/\n+/g,' | '));

// 5. dare link
const shareBtn = p.locator('button:has-text("Dare a friend")');
console.log('dare button enabled:', await shareBtn.isEnabled());

console.log('page errors:', errs.length, errs.slice(0,3));
await b.close();
