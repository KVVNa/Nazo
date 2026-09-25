// ビルド後に dist/sw.js を生成する。dist 内の全ファイルを事前キャッシュし、
// 内容のハッシュをキャッシュ名に入れるので、更新すると古いキャッシュだけが消える（セーブは localStorage なので残る）。
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const dist = 'dist';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f !== 'sw.js') files.push(relative(dist, p).split('\\').join('/'));
  }
})(dist);
const hash = createHash('sha256');
for (const f of files.sort()) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
const urls = ['./', ...files.map((f) => './' + f)];

const sw = `// 自動生成（scripts/gen-sw.mjs）
const CACHE = 'ssm-${version}';
const PRECACHE = ${JSON.stringify(urls, null, 2)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ssm-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // 画面遷移は、まずネットワーク、だめならキャッシュの index
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./', copy));
      return res;
    }).catch(() => caches.match('./', { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
console.log('sw.js written:', CACHE_NAME(version), urls.length, 'files');
function CACHE_NAME(v) { return 'ssm-' + v; }
