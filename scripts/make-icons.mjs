// 依存なしでピクセルアイコン（PNG）を作る。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const G = 16; // 16×16 ドットの原画
const pal = { '.': [11, 13, 22], 'o': [124, 134, 166], 'w': [230, 234, 247], 'y': [255, 206, 92], 'b': [62, 123, 214], 'd': [38, 43, 58] };
const art = [
  '................',
  '......oooo......',
  '.....owwwwo.....',
  '....owbbbbwo....',
  '....owbbbbwo....',
  '...oowwwwwwoo...',
  '..oddddddddddo..',
  '..oddyddddyddo..',
  '..oddddddddddo..',
  '..oddddyydddd o.',
  '..oddddddddddo..',
  '...oooddddooo...',
  '.....oyyyyo.....',
  '......oyyo......',
  '.......yy.......',
  '................',
].map((r) => r.replace(/ /g, 'd'));

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pad) {
  const inner = size - pad * 2;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = pal['.'];
      const ix = x - pad, iy = y - pad;
      if (ix >= 0 && iy >= 0 && ix < inner && iy < inner) {
        const ch = art[Math.floor((iy / inner) * G)][Math.floor((ix / inner) * G)];
        col = pal[ch] ?? pal['.'];
      }
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 16));
writeFileSync('public/icons/icon-512.png', png(512, 64));
writeFileSync('public/icons/apple-touch-icon.png', png(180, 14));
console.log('icons written');
