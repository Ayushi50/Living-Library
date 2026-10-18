// Browser test of the signature bookshelf. Run: node tests/e2e/shelf.mjs  (needs `playwright` + a built ./dist served on :4173)
import { chromium } from 'playwright';
const OUT = process.env.SHOTS || '/tmp';
const base = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(base + '/#/');
await page.waitForSelector('[data-testid=load-demo]');
await page.click('[data-testid=load-demo]');
await page.goto(base + '/#/library');
await page.waitForSelector('[data-testid=spine]');
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/01-shelf.png` });
const spines = await page.locator('[data-testid=spine]').count();
console.log('spines rendered:', spines);

// hover lift
const first = page.locator('[data-testid=spine]').nth(3);
const before = await first.locator('xpath=..').locator('.book3d').evaluate((el) => getComputedStyle(el).transform);
await first.hover();
await page.waitForTimeout(800);
const after = await first.locator('xpath=..').locator('.book3d').evaluate((el) => getComputedStyle(el).transform);
console.log('hover transform changed:', before !== after, '\n  before:', before, '\n  after:', after);
await page.screenshot({ path: `${OUT}/02-hover.png`, clip: { x: 0, y: 150, width: 1360, height: 480 } });

// click -> pull out
await first.click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/03-pull-mid.png` });
await page.waitForSelector('[data-testid=book-detail]');
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/04-detail.png` });
console.log('route:', await page.evaluate(() => location.hash));

// close -> back on shelf
await page.click('[data-testid=close-detail]');
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/05-close-mid.png` });
await page.waitForTimeout(900);
console.log('detail gone:', (await page.locator('[data-testid=book-detail]').count()) === 0, 'route:', await page.evaluate(() => location.hash));
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
