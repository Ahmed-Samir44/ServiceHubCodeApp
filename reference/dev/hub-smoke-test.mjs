import { chromium } from 'playwright-core';
const out = process.argv[2];
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
await page.goto('http://localhost:5182/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
await page.reload({ waitUntil: 'networkidle' });
const nav = (label) => page.click(`.content > .filter-bar button:has-text("${label}")`);
const sub = (label) => page.click(`.bento [role=tablist] button:has-text("${label}")`);
const settle = () => page.waitForTimeout(600);
const summary = async () => (await page.$('.hub-count')) ? page.textContent('.hub-count') : '(no count)';
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });

await page.click('.region-opt:has-text("Egypt")');
await nav('Programs'); await settle();
await page.click('.hub-fold-card summary >> nth=0');
console.log('Programs:', await summary()); await shot('01-programs');
await nav('Home Care'); await settle();
await page.click('.bento .filter-bar button:has-text("ASH")');
await page.click('button:has-text("Scripts")');
await page.click('button:has-text("Nursing")');
await page.click('button:has-text("Booking")');
await page.click('.hub-card-btn:has-text("Nursing visit")');
await shot('02-homecare-script');
await nav('Quick Links'); await settle();
console.log('Scripts page loaded');
await page.click('.bento .filter-bar button:has-text("Appointments")');
await page.click('.bento .filter-bar button:has-text("New booking")');
console.log('Scripts:', await summary()); await shot('03-scripts');
for (const [tab, name] of [['Insurance', '04-insurance'], ['Booking Policy', '05-booking'], ['System Links', '06-links'], ['Quality Assurance', '07-qa'], ['CRM Dictionary', '08-crm'], ['Department Working', '09-dwh']]) {
  await sub(tab); await settle();
  if (tab === 'Booking Policy') await page.click('details summary >> nth=0').catch(() => {});
  console.log(tab + ':', await summary(), (await page.$$('.hub-card, .hub-link-btn, details')).length, 'items');
  await shot(name);
}
await nav('Health Libraries'); await settle();
console.log('CPGs:', await summary());
await page.click('.hub-card-btn:has-text("Chest Pain")');
await shot('10-cpg-viewer');
await sub('CAPEX'); await settle();
console.log('CAPEX:', await summary()); await shot('11-capex');
await sub('Other Health Info'); await settle();
console.log('Other health:', (await page.$$('.hub-link-btn')).length);
// KSA versions
await page.click('.region-chip'); await page.click('.region-opt:has-text("Saudi")'); await settle();
await nav('Quick Links'); await settle();
for (const tab of ['Events', 'Installments', 'Special Handling', 'Insurance']) {
  await sub(tab); await settle();
  console.log('KSA ' + tab + ':', (await page.$$('.hub-link-btn')).length, 'buttons', (await page.$('.empty-title')) ? await page.textContent('.empty-title') : '');
}
await sub('Events'); await settle();
await page.click('.hub-link-btn >> nth=0');
await shot('12-ksa-events-viewer');
console.log('problems:', problems.length ? [...new Set(problems)].slice(0, 6).join(' | ').slice(0, 900) : 'none');
await browser.close();
