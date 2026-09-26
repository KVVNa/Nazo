// 通し試遊（iPhone 13 相当の縦画面）。npm run build のあとに npm run e2e。
// ① 第1話を証拠から推理して「真相解明」まで ② 全13事件を開始→進行→提出→結果まで ③ 機内モード相当での再起動
import { chromium, devices } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const OUT = process.env.SHOTS || 'e2e/shots';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4174, strictPort: true } });
const URL = 'http://localhost:4174/';
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const btn = (name) => page.getByRole('button', { name, exact: true });
const tab = (name) => page.locator('nav.tabs button', { hasText: name }).click();
const step = (m) => console.log('•', m);
function assert(c, m) { if (!c) throw new Error('確認失敗: ' + m); }

async function startCase(n) {
  await page.goto(URL);
  await page.locator('button', { hasText: '事件を選ぶ' }).click();
  await page.locator('.sheet .opt').nth(n).click();
  const again = page.locator('.sheet button', { hasText: '始める' });
  if (await again.count()) await again.click();
  await btn('司令室へ').waitFor({ timeout: 15000 });
  const title = await page.locator('h1').textContent();
  await btn('司令室へ').click();
  return title;
}

async function order(rowText, label, room) {
  await tab('乗員');
  await page.locator('.crew-row', { hasText: rowText }).first().click();
  await page.locator('.sheet .opt', { hasText: label }).first().click();
  if (room) await page.locator('.sheet .opt', { hasText: room }).first().click();
}

async function runUntil(pred, maxMs = 60000) {
  await tab('船内');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    for (const b of await page.locator('.card button', { hasText: '許可する' }).all()) await b.click();
    for (const b of await page.locator('.card button', { hasText: '適用する' }).all()) await b.click();
    if (await pred()) return true;
    const playBtn = page.locator('.playbtn');
    if ((await playBtn.textContent())?.includes('進行')) await playBtn.click();
    await page.waitForTimeout(400);
  }
  return false;
}
const pause = async () => { if ((await page.locator('.playbtn').textContent())?.includes('停止')) await page.locator('.playbtn').click(); };
async function evidenceTitles() {
  await tab('メモ');
  const t = await page.locator('.ecard .ttl').allTextContents();
  await tab('船内');
  return t;
}

// ---------- ① 第1話を推理して解く ----------
const title = await startCase(0);
assert(title.includes('消えた電力'), '第1話を選べる');
await shot('10-ship-start');
await page.locator('button.speed', { hasText: '×2' }).click();
await order('機関士', '電源を復旧');
await tab('乗員');
const rows = await page.locator('.crew-row').allTextContents();
const others = rows.filter((r) => !r.includes('機関士') && !r.includes('通信断')).map((r) => r.split('　')[0]);
await order(others[0], '区画を調査', '司令室');
await order(others[1], '区画を調査', '貨物室');
await order(others[2], '区画を調査', '下層機関区');
if (others[3]) await order(others[3], '区画を調査', '下層機関区'); // 技能は最初は分からないので二人送る
await tab('乗員');
await shot('11-crew');
step('方針を設定: ' + others.slice(0, 3).join(', '));

await runUntil(async () => (await page.locator('.ticker').textContent())?.includes('通信が途絶えた'), 20000);
await pause();
await tab('乗員');
const engRow = await page.locator('.crew-row', { hasText: '機関士' }).textContent();
assert(engRow.includes('通信断・情報なし'), '通信断の機関士は「情報なし」: ' + engRow);
step('通信断の秘匿を確認: ' + engRow.replace(/\s+/g, ' '));

const need = ['配電盤ログ', '床の冷却液痕', '冷却圧ログ', '整備記録', '部品在庫記録'];
let lastTs = [];
let ok1 = await runUntil(async () => { lastTs = await evidenceTitles(); return need.every((n) => lastTs.includes(n)); }, 60000);
if (!ok1) {
  // 見つからない証拠があれば、別の乗員に同じ区画を調べ直させる（関係者は自分に不利な記録を伏せる）
  const where = { 部品在庫記録: '貨物室', 整備記録: '司令室', 冷却圧ログ: '下層機関区' };
  const missing = need.filter((n) => !lastTs.includes(n));
  step('足りない証拠を別の乗員に調べ直させる：' + missing.join('、'));
  const pool = others.filter((_, i) => i !== 1); // 最初に貨物室を調べた乗員以外
  let k = 0;
  for (const m of missing) if (where[m]) await order(pool[k++ % pool.length], '区画を調査', where[m]);
  ok1 = await runUntil(async () => { lastTs = await evidenceTitles(); return need.every((n) => lastTs.includes(n)); }, 90000);
}
assert(ok1, '必須の証拠がそろう（足りない：' + need.filter((n) => !lastTs.includes(n)).join('、') + '）');
await pause();
await tab('記録');
await shot('13-log');
assert((await page.locator('.tag.delayed').count()) > 0, '通信断中の出来事が遅れて届く');
assert((await page.locator('.reason').count()) > 0, '判断理由つきの報告がある');

// 通信の届く全員から話を聞く
await tab('乗員');
const nCrew = await page.locator('.crew-row').count();
for (let i = 0; i < nCrew; i++) {
  await tab('乗員');
  await page.locator('.crew-row').nth(i).click();
  const talk = page.locator('.sheet button', { hasText: '話を聞く' });
  if (await talk.isEnabled()) await talk.click(); else await page.locator('.sheet .close').click();
}
await tab('仮説');
const cards = await page.locator('.order-row .lbl').allTextContents();
step('並べられる出来事: ' + cards.join(' / '));
assert(cards.length === 4, '出来事カードが4枚浮上している');
assert((await page.locator('label.radio', { hasText: '冷却配管の亀裂' }).count()) === 1, '正しい原因が浮上している');

await tab('メモ');
await btn('線を引く').click();
await page.locator('.ecard', { hasText: '整備記録' }).click();
await page.locator('.ecard', { hasText: '部品在庫記録' }).click();
await page.waitForTimeout(150);
await btn('＋ メモを書く').click();
await page.locator('.sheet textarea').fill('記録では交換済み。でも在庫は減っていない');
await btn('メモを貼る').click();
assert((await page.locator('.ecard.note').count()) === 1, '自分のメモを貼れる');
const maint = await page.locator('.ecard', { hasText: '整備記録' }).locator('.txt').textContent();
const culprit = maint.match(/担当：([^）]+)）/)[1];
await shot('15-memo');
step('整備記録の担当者: ' + culprit);

await tab('仮説');
await page.getByLabel('事故・故障').check();
await page.getByLabel('冷却配管の亀裂から漏れた冷却液が配電盤を地絡させた').check();
const want = ['冷却圧の低下が始まる', '貨物室のドアが開閉される', '機関区で光が明滅する', '主配電盤が保護遮断する'];
for (let i = 0; i < want.length; i++) {
  for (let k = 0; k < 6; k++) {
    const ls = await page.locator('.order-row .lbl').allTextContents();
    const at = ls.indexOf(want[i]);
    if (at === i) break;
    await page.locator('.order-row').nth(at).getByRole('button', { name: '上へ' }).click();
  }
}
await page.locator('select').selectOption({ label: culprit });
await page.getByLabel('事実を偽った・隠した').check();
for (const t of ['配電盤ログ', '床の冷却液痕', '整備記録', '部品在庫記録']) await page.locator('label.radio', { hasText: t }).locator('input').check();
await page.getByLabel(/漏れを封止し、乾燥させてから/).check();
await shot('16-hypo');
await page.locator('button', { hasText: '仮説を提出して作戦を発令' }).click();
await page.locator('.sheet button', { hasText: '提出して発令' }).click();
const resolved = await runUntil(async () => (await page.locator('.ticker').textContent())?.includes('危機は去った'), 60000);
assert(resolved, '正しい作戦で危機が去る');
await pause();
await shot('17-resolved');
await tab('仮説');
await page.locator('button', { hasText: '事件を締めくくる' }).click();
await page.locator('.sheet button', { hasText: '確定する' }).click();
await page.waitForSelector('.grade', { timeout: 5000 });
const grade = await page.locator('.grade').textContent();
await page.screenshot({ path: `${OUT}/18-result.png`, fullPage: true });
assert(grade === '真相解明', '第1話を真相解明できる（' + grade + '）');
await btn('事件記録に保存').click();
step('第1話：' + grade);

// ---------- ② 全13事件を開始→進行→提出→結果 ----------
for (let n = 0; n < 13; n++) {
  const t = await startCase(n);
  await tab('乗員');
  await page.locator('.crew-row').first().click();
  await page.locator('.sheet .opt').nth(1).click(); // 現場対応
  await runUntil(async () => (await page.locator('.ticker .item').count()) >= 4 && (await page.locator('.clock').textContent()) !== '', 6000);
  await pause();
  if (n === 3) await shot('20-case-food');
  if (n === 8) await shot('21-case-seu');
  if (n === 11) await shot('22-case-creak');
  if (n === 12) await shot('23-case-plot');
  for (const name of ['乗員', '記録', 'メモ', '船内']) await tab(name);
  await tab('仮説');
  await page.locator('input[name=cat]').first().check();
  await page.locator('input[name=cause]').first().check();
  await page.locator('input[name=plan]').first().check();
  await page.locator('button', { hasText: '仮説を提出して作戦を発令' }).click();
  await page.locator('.sheet button', { hasText: '提出して発令' }).click();
  await runUntil(async () => false, 3000);
  await pause();
  await tab('仮説');
  await page.locator('button', { hasText: /事件を締めくくる|調査を打ち切って/ }).click();
  await page.locator('.sheet button', { hasText: '確定する' }).click();
  await page.waitForSelector('.grade', { timeout: 5000 });
  const g = await page.locator('.grade').textContent();
  step(`${String(n + 1).padStart(2, '0')} ${t.replace('事件：', '')} → ${g}`);
}

// ---------- ③ オフライン起動 ----------
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('.logo', { timeout: 5000 });
await page.locator('button', { hasText: '新しい事件' }).click();
const again = page.locator('.sheet button', { hasText: '始める' });
if (await again.count()) await again.click();
await btn('司令室へ').waitFor({ timeout: 15000 });
await btn('司令室へ').click();
await page.waitForSelector('#map');
await shot('19-offline');
step('機内モード相当で起動できた');
await ctx.setOffline(false);

console.log(errors.length ? 'ページのエラー: ' + errors.join('\n') : 'ページのエラーなし');
await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) process.exit(1);
