// 航海モードの通し試遊（iPhone 13 相当）。プロローグ → 出港前夜 → 5話（合間の会話・手当て） → 到着と報告書 → 結末。
// 途中でタイトルに戻って「航海を続ける」から再開できることも確かめる。
import { chromium, devices } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS || 'e2e/shots';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4175, strictPort: true } });
const URL = 'http://localhost:4175/';
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const tab = (name) => page.locator('nav.tabs button', { hasText: name }).click();
const step = (m) => console.log('•', m);
function assert(c, m) { if (!c) throw new Error('確認失敗: ' + m); }
const click = (sel, text) => page.locator(sel, { hasText: text }).first().click();
const showAll = async () => { const b = page.locator('button', { hasText: 'すべて表示' }); if (await b.count()) await b.first().click(); };

await page.goto(URL);
await click('button', '新しい航海を始める');
await page.locator('.sheet input').fill('20260926');
await click('.sheet button', '出港の準備をする');

// プロローグ3場面
for (let i = 0; i < 3; i++) {
  await page.waitForSelector('.dl');
  if (i === 0) { await page.locator('.screen').click({ position: { x: 100, y: 400 } }); await shot('v01-prologue'); }
  await showAll();
  await click('button', '次へ');
}
// 出港前夜：8人に一言ずつ返す
await showAll();
for (let i = 0; i < 8; i++) {
  await page.locator('.screen button.opt').first().waitFor();
  if (i === 1) await shot('v02-dinner');
  await page.locator('.screen button.opt').first().click();
  await showAll();
}
await showAll();
await shot('v03-departure');
await click('button', '航海へ');

for (let st = 0; st < 5; st++) {
  await page.locator('button', { hasText: `第${st + 1}話へ` }).waitFor();
  if (st === 0) await shot('v04-stage1');
  await click('button', `第${st + 1}話へ`);
  await page.locator('button', { hasText: '司令室へ' }).waitFor({ timeout: 30000 });
  const title = (await page.locator('h1').textContent()) ?? '';
  if (st === 0) await shot('v05-briefing');
  await click('button', '司令室へ');
  // 途中でタイトルへ戻り、続きから再開できる
  if (st === 1) {
    await page.locator('button[aria-label=メニュー]').click();
    await click('.sheet button', 'タイトルへ');
    await click('button', '航海を続ける');
    await page.locator('button', { hasText: '司令室へ' }).or(page.locator('nav.tabs')).first().waitFor();
    if (await page.locator('button', { hasText: '司令室へ' }).count()) await click('button', '司令室へ');
  }
  await tab('乗員');
  await page.locator('.crew-row').first().click();
  await page.locator('.sheet .opt').nth(1).click();
  await page.locator('.playbtn').click();
  await page.waitForTimeout(1500);
  if ((await page.locator('.playbtn').textContent())?.includes('停止')) await page.locator('.playbtn').click();
  await tab('仮説');
  await page.locator('input[name=cat]').first().check();
  await page.locator('input[name=cause]').first().check();
  await page.locator('input[name=plan]').first().check();
  await click('button', '仮説を提出して作戦を発令');
  await click('.sheet button', '提出して発令');
  await tab('仮説');
  await page.locator('button', { hasText: /事件を締めくくる|調査を打ち切って/ }).click();
  await click('.sheet button', '確定する');
  await page.waitForSelector('.grade', { timeout: 8000 });
  const g = await page.locator('.grade').textContent();
  step(`第${st + 1}話 ${title.replace('事件：', '')} → ${g}`);
  if (st === 0) await shot('v06-result');
  await click('button', '航海に戻る');
  if (st < 4) {
    await page.locator('button', { hasText: /日目へ$/ }).waitFor();
    // 手当てと会話
    for (const label of ['船体を修理する', '負傷者を手当てする']) {
      const b = page.locator('button', { hasText: label });
      if (await b.count() && await b.isEnabled()) { await b.click(); break; }
    }
    for (let k = 0; k < 3; k++) {
      const talkBtns = page.locator('.crew-row button', { hasText: /^話す$/ });
      if (!(await talkBtns.count())) break;
      await talkBtns.nth(k % Math.max(1, await talkBtns.count())).click();
      await page.waitForSelector('.sheet .dl');
      await showAll();
      const opt = page.locator('.sheet button.opt');
      if (await opt.count()) { await opt.first().click(); await showAll(); }
      if (st === 1 && k === 0) await shot('v07-talk');
      await page.locator('.sheet button', { hasText: /戻る|閉じる/ }).first().click();
      if (await page.locator('.sheet').count()) await page.locator('.sheet button.close').click();
    }
    if (st === 1) await shot('v08-interlude');
    await page.locator('button', { hasText: /日目へ$/ }).click();
    const go = page.locator('.sheet button', { hasText: '進む' });
    if (await go.count()) await go.click();
  }
}

// 到着と報告書
await page.locator('.dl').first().waitFor();
await showAll();
await page.locator('input[name=rep]').first().check();
await shot('v09-report');
const boxes = page.locator('.card input[type=checkbox]');
for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check();
await click('button', '署名する');
await click('.sheet button', '署名する');
await showAll();
await click('button', 'その後');
await page.locator('.rank').waitFor();
await shot('v10-ending');
step('航海の評価 ' + await page.locator('.rank').textContent() + ' ' + await page.locator('.rank + div').textContent());
await click('button', 'タイトルへ');
assert(await page.locator('button', { hasText: '航海を続ける' }).count() === 0, '航海が終わったのに「続ける」が出ている');

assert(errors.length === 0, 'ページのエラー: ' + errors.join(' / '));
step('航海モードの通し試遊：完了');
await browser.close();
await server.httpServer.close();
