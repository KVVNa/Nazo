// 通し試遊（iPhone 13 相当の縦画面）。npm run build のあとに npm run e2e。
// 開始 → 方針設定 → 進行 → 証言 → ボード接続 → 仮説提出 → 事件終了 → 機内モード相当での再起動、までを確認する。
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
const step = (m) => console.log('•', m);
function assert(c, m) { if (!c) throw new Error('確認失敗: ' + m); }

await page.goto(URL);
await btn('はじめから').click();
await btn('司令室へ').click();
await shot('10-ship-start');
step('開始できた');

async function order(name, label, room) {
  await page.locator('nav.tabs button', { hasText: '乗員' }).click();
  await page.locator('.crew-row', { hasText: name }).click();
  await page.locator('.sheet .opt', { hasText: label }).first().click();
  if (room) await page.locator('.sheet .opt', { hasText: room }).click();
}
await order('ミナ', '電源を復旧');
await order('ケイ', '区画を調査', '司令室');
await order('ソラ', '区画を調査', '医務室');
await order('ドゥラン', '区画を調査', '下層機関区');
await page.locator('nav.tabs button', { hasText: '乗員' }).click();
await shot('11-crew');
step('方針を設定した');

await page.locator('nav.tabs button', { hasText: '船内' }).click();
await page.locator('button.speed', { hasText: '×2' }).click(); // ×3 へ
async function runUntil(pred, maxMs = 60000) {
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
const clock = async () => (await page.locator('.clock').textContent()) ?? '';

// ミナが通信断に入ったとき、見取り図・乗員一覧に位置や行動が漏れていないか
await runUntil(async () => (await clock()) >= '02:26', 20000);
if ((await page.locator('.playbtn').textContent())?.includes('停止')) await page.locator('.playbtn').click();
await shot('12-ship-nocomm');
await page.locator('nav.tabs button', { hasText: '乗員' }).click();
const minaRow = await page.locator('.crew-row', { hasText: 'ミナ' }).textContent();
assert(minaRow.includes('通信断・情報なし'), '通信断のミナが「情報なし」と表示される: ' + minaRow);
assert(!minaRow.includes('配電室：'), '通信断のミナの現在地が漏れていない');
step('通信断の秘匿を確認: ' + minaRow.replace(/\s+/g, ' '));
await page.locator('nav.tabs button', { hasText: '船内' }).click();

const ok = await runUntil(async () => (await page.locator('.ticker').textContent())?.includes('通信が回復'), 60000);
assert(ok, 'ミナとの通信回復');
await page.locator('nav.tabs button', { hasText: '記録' }).click();
await shot('13-log-delayed');
const delayed = await page.locator('.tag.delayed').count();
assert(delayed > 0, '通信断中の出来事が遅れて届く');
const reasons = await page.locator('.reason').count();
assert(reasons > 0, '判断理由つきの報告がある');
step(`遅延報告 ${delayed} 件、理由つき ${reasons} 件`);

// 話を聞く
for (const n of ['ソラ', 'ドゥラン']) {
  await page.locator('nav.tabs button', { hasText: '乗員' }).click();
  await page.locator('.crew-row', { hasText: n }).click();
  const talk = page.locator('.sheet button', { hasText: '話を聞く' });
  if (await talk.isEnabled()) await talk.click(); else await page.locator('.sheet .close').click();
}
await shot('14-log-talk');
step('証言を得た');

// 貨物室の在庫はドゥランが伏せるので、ケイに調べ直させる
await order('ケイ', '区画を調査', '貨物室');
await page.locator('nav.tabs button', { hasText: '船内' }).click();
await runUntil(async () => {
  await page.locator('nav.tabs button', { hasText: 'ボード' }).click();
  const has = (await page.locator('.ecard', { hasText: '部品在庫記録' }).count()) > 0;
  await page.locator('nav.tabs button', { hasText: '船内' }).click();
  return has;
}, 40000);

// ボード：線を張る
await page.locator('nav.tabs button', { hasText: 'ボード' }).click();
await btn('線でつなぐ').click();
const cards = page.locator('.ecard');
const nCards = await cards.count();
assert(nCards >= 5, 'ボードに証拠が並ぶ (' + nCards + ')');
await page.locator('.ecard', { hasText: '整備記録' }).click();
await page.locator('.ecard', { hasText: '部品在庫記録' }).click();
await page.locator('.ecard', { hasText: '配電盤ログ' }).click();
await page.locator('.ecard', { hasText: '床の冷却液痕' }).click();
await page.waitForTimeout(200);
const links = await page.locator('.board svg line').count();
assert(links >= 4, '線が張れた');
await btn('動かす').click();
const card = page.locator('.ecard', { hasText: '配電盤ログ' });
const bb = await card.boundingBox();
await page.mouse.move(bb.x + 40, bb.y + 20);
await page.mouse.down();
await page.mouse.move(bb.x + 120, bb.y + 160, { steps: 8 });
await page.mouse.up();
await shot('15-board');
step(`ボード：カード${nCards}枚、線を2本`);

// 仮説を提出（正解の組み立て）
await page.locator('nav.tabs button', { hasText: '仮説' }).click();
await page.getByLabel('事故・故障').check();
await page.getByLabel('冷却配管の亀裂から漏れた冷却液が配電盤を地絡させた').check();
const want = ['冷却圧の低下が始まる', '貨物室のドアが開閉される', '機関区で光が明滅する', '主配電盤が保護遮断する'];
for (let i = 0; i < want.length; i++) {
  for (let guard = 0; guard < 6; guard++) {
    const rows = await page.locator('.order-row .lbl').allTextContents();
    const at = rows.indexOf(want[i]);
    if (at === i) break;
    await page.locator('.order-row').nth(at).getByRole('button', { name: '上へ' }).click();
  }
}
await page.locator('select').selectOption({ label: 'ドゥラン' });
await page.getByLabel('事実を偽った・隠した').check();
for (const t of ['配電盤ログ', '床の冷却液痕', '整備記録', '部品在庫記録']) await page.locator('label.radio', { hasText: t }).locator('input').check();
await page.getByLabel(/漏れを封止し、乾燥させてから/).check();
await shot('16-hypo');
await page.locator('button', { hasText: '仮説を提出して作戦を発令' }).click();
await page.locator('.sheet button', { hasText: '提出して発令' }).click();
step('仮説を提出');

const resolved = await runUntil(async () => (await page.locator('.ticker').textContent())?.includes('危機は去った'), 60000);
assert(resolved, '正しい作戦で危機が去る');
await shot('17-resolved');
await page.locator('nav.tabs button', { hasText: '仮説' }).click();
await page.locator('button', { hasText: '事件を締めくくる' }).click();
await page.locator('.sheet button', { hasText: '確定する' }).click();
await page.waitForTimeout(500); await shot('17b-after-close'); await page.waitForSelector('.grade', { timeout: 5000 });
const grade = await page.locator('.grade').textContent();
await page.screenshot({ path: `${OUT}/18-result.png`, fullPage: true });
step('事件結果: ' + grade);
await btn('航海記録に保存').click();
assert((await page.locator('button', { hasText: '航海記録に保存済み' }).count()) === 1, '航海記録を保存できる');

// オフライン起動（初回読み込みで Service Worker がキャッシュ済み）
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.waitForTimeout(500);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('.logo', { timeout: 5000 });
await btn('はじめから').click();
await btn('司令室へ').click();
await page.waitForSelector('#map');
await shot('19-offline');
step('機内モード相当で起動できた');
await ctx.setOffline(false);

console.log(errors.length ? 'ページのエラー: ' + errors.join('\n') : 'ページのエラーなし');
await browser.close();
await new Promise((r) => server.httpServer.close(r));
if (errors.length) process.exit(1);
