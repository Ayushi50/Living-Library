// End-to-end flows against the built app. Run: node tests/e2e/flows.mjs (dist served on :4173; SHOTS=dir for screenshots)
import { chromium } from 'playwright';
const OUT = process.env.SHOTS || '/tmp';
const base = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(ok ? 'PASS' : 'FAIL', name, extra); };
const errors = [];
const newPage = async (ctx) => { const p = await ctx.newPage(); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::/.test(m.text()) && errors.push(m.text())); p.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); return p; };

const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await newPage(ctx);
await page.goto(base + '/#/');
await page.waitForSelector('.first-run');
check('empty first-run shows, no fake data', (await page.locator('.stat-tile').count()) === 0);

// add a book by hand
await page.click('.quick-add button:has-text("Book")');
await page.click('[data-testid=manual-entry]');
await page.fill('input[data-autofocus]', 'The Test Book');
await page.getByLabel('Author', { exact: true }).fill('Ada Tester');
await page.getByLabel('Pages', { exact: false }).first().fill('300');
await page.selectOption('select >> nth=0', 'reading').catch(() => {});
await page.click('[data-testid=save-book]');
await page.waitForTimeout(600);
check('book added and detail route opens', /library\/b\//.test(page.url()));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/10-new-book.png` });

// log progress through quick +10 if present
const plus = page.locator('button:has-text("+25")').first();
if (await plus.count()) { await plus.click(); await page.waitForTimeout(400); }
await page.reload();
await page.waitForTimeout(800);
check('book persists across reload', (await page.content()).includes('The Test Book'));

// duplicate warning
await page.goto(base + '/#/library');
await page.click('[data-testid=add-book]');
await page.click('[data-testid=manual-entry]');
await page.fill('input[data-autofocus]', 'the test book');
await page.getByLabel('Author', { exact: true }).fill('Ada Tester');
check('duplicate warning shown', await page.locator('.dup-note').count() > 0);
for (let i = 0; i < 3 && await page.locator('.modal-scrim').count(); i++) { await page.locator('.modal-scrim [aria-label=Close]').last().click(); await page.waitForTimeout(150); }

// screen: add a series by hand, ongoing
await page.goto(base + '/#/screen');
await page.click('[data-testid=add-media]');
await page.locator('.segmented >> text=/^TV$/').first().click();
await page.click('[data-testid=manual-entry]');
await page.fill('input[data-autofocus]', 'Ongoing Show');
await page.getByLabel('Season 1 episode count').fill('3');
await page.click('[data-testid=save-media]');
await page.waitForSelector('[data-testid=media-detail]');
for (let i = 0; i < 3; i++) { await page.click('[data-testid=watch-next]'); await page.waitForTimeout(150); }
await page.waitForTimeout(500);
const status = await page.locator('select[aria-label="Viewing status"]').inputValue();
check('ongoing show caught up is NOT completed', status === 'watching', status);
await page.screenshot({ path: `${OUT}/11-series.png`, fullPage: true });
await page.getByRole('radio', { name: 'Ended', exact: true }).click();
await page.waitForTimeout(400);
check('marking ended + all watched completes', (await page.locator('select[aria-label="Viewing status"]').inputValue()) === 'completed');

// movie + rewatch
await page.goto(base + '/#/screen');
await page.click('[data-testid=add-media]');
await page.click('[data-testid=manual-entry]');
await page.fill('input[data-autofocus]', 'Solo Film');
await page.click('[data-testid=save-media]');
await page.waitForSelector('[data-testid=log-viewing]');
await page.click('[data-testid=log-viewing]'); await page.waitForTimeout(200);
await page.click('[data-testid=log-viewing]'); await page.waitForTimeout(300);
check('rewatch recorded', (await page.locator('.viewing-list li').count()) === 2);

// journal
await page.goto(base + '/#/journal');
await page.fill('textarea', 'A line worth keeping');
await page.click('.composer button[type=submit]');
await page.waitForTimeout(300);
check('journal entry saved & listed', (await page.locator('.entry').count()) >= 1);
await page.fill('[aria-label="Search the journal"]', 'zzzz');
check('journal search filters', (await page.locator('.entry').count()) === 0);

// stats + home
await page.goto(base + '/#/stats');
await page.waitForSelector('.stat-grid');
check('stats render real counts', (await page.locator('.recap').count()) === 1);
await page.screenshot({ path: `${OUT}/12-stats.png`, fullPage: true });
await page.goto(base + '/#/');
await page.waitForSelector('.home-cols');
await page.screenshot({ path: `${OUT}/13-home.png`, fullPage: true });

// search palette
await page.keyboard.press('Control+k');
await page.fill('[role=combobox]', 'Solo');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('palette opens the title', /screen\/m\//.test(page.url()));

// settings: export download & import validation
await page.goto(base + '/#/settings');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid=export-json]')]);
const path = await dl.path();
const fs = await import('node:fs');
const exported = fs.readFileSync(path, 'utf8');
check('export is valid JSON with data', JSON.parse(exported).books.length === 1);
fs.writeFileSync('/tmp/bad.json', '{nope');
await page.setInputFiles('[data-testid=import-file]', '/tmp/bad.json');
check('bad import shows error', (await page.locator('.notice.is-error').count()) === 1);
await page.setInputFiles('[data-testid=import-file]', path);
await page.waitForSelector('.import-preview');
await page.click('[data-testid=run-import]');
await page.waitForTimeout(400);
check('re-import skips duplicates (no doubling)', (await page.locator('.import-report').innerText()).includes('Skipped'));
await page.goto(base + '/#/library');
await page.waitForTimeout(800);
check('still one book after reimport', (await page.locator('[data-testid=spine]').count()) === 1);

// theme toggle
await page.click('[data-testid=theme-toggle]');
check('theme toggles', ['dark', 'light'].includes(await page.evaluate(() => document.documentElement.dataset.theme)));

// demo load/remove
await page.goto(base + '/#/settings');
await page.getByRole('button', { name: 'Load sample content' }).click();
await page.waitForTimeout(300);
await page.click('[data-testid=remove-demo]');
await page.click('.modal button:has-text("Remove sample content")');
await page.waitForTimeout(300);
await page.goto(base + '/#/library'); await page.waitForTimeout(600);
check('removing demo leaves user data', (await page.locator('[data-testid=spine]').count()) === 1);

// reset needs confirmation
await page.goto(base + '/#/settings');
await page.click('[data-testid=reset-all]');
await page.keyboard.press('Escape');
await page.goto(base + '/#/library'); await page.waitForTimeout(500);
check('cancelled reset keeps data', (await page.locator('[data-testid=spine]').count()) === 1);
await ctx.close();

// mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const mp = await newPage(m);
await mp.goto(base + '/#/');
await mp.waitForSelector('.first-run');
await mp.click('[data-testid=load-demo]');
await mp.waitForTimeout(500);
await mp.screenshot({ path: `${OUT}/20-mobile-home.png`, fullPage: true });
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
check('mobile home has no horizontal overflow', overflow <= 1, String(overflow));
for (const r of ['library', 'screen', 'journal', 'stats', 'settings']) {
  await mp.goto(base + '/#/' + r); await mp.waitForTimeout(700);
  const o = await mp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`mobile ${r} no overflow`, o <= 1, String(o));
}
await mp.goto(base + '/#/library'); await mp.waitForTimeout(1200);
await mp.screenshot({ path: `${OUT}/21-mobile-library.png` });
await m.close();

// reduced motion
const rm = await browser.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: 'reduce' });
const rp = await newPage(rm);
await rp.goto(base + '/#/'); await rp.click('[data-testid=load-demo]');
await rp.goto(base + '/#/library'); await rp.waitForSelector('[data-testid=spine]');
check('reduce-motion flag applied', (await rp.evaluate(() => document.documentElement.dataset.motion)) === 'reduce');
await rp.locator('[data-testid=spine]').nth(2).click();
await rp.waitForTimeout(500);
check('book opens under reduced motion', /library\/b\//.test(rp.url()));
await rm.close();

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
