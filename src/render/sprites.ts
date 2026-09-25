// 乗員のピクセル絵をパレットと部品の組み合わせで生成する（外部素材なし）。
// 手描き素材に差し替えるときは portraitURL / drawMini を差し替えればよい。
export interface Look { skin: number; hair: number; hairStyle: number; suit: number; eyes: number }

const SKIN = ['#f1c9a5', '#d9a47a', '#b07650', '#7a4a2e'];
const SKIN_SH = ['#d8a882', '#bb8660', '#8f5c3b', '#5c3620'];
const HAIR = ['#1d1a24', '#5a3a28', '#c9c2b8', '#a8412f'];
const SUIT = ['#d0782a', '#3e7bd6', '#d9dce6', '#5d6b45'];
const SUIT_SH = ['#9c5518', '#2a569b', '#a9aebd', '#3f4a2d'];
const EYES = ['#1b1b28', '#2d5a7a'];
const BG = ['#3a2a22', '#1e2c44', '#2a3440', '#2a2f22'];

type Px = (x: number, y: number, w: number, h: number, c: string) => void;

function drawPortrait(px: Px, l: Look) {
  const sk = SKIN[l.skin], sh = SKIN_SH[l.skin], hr = HAIR[l.hair], su = SUIT[l.suit], ss = SUIT_SH[l.suit];
  px(0, 0, 24, 24, BG[l.suit]);
  for (let y = 0; y < 24; y += 2) px(0, y, 24, 1, 'rgba(255,255,255,0.03)');
  // 後ろ髪（長髪）
  if (l.hairStyle === 2) px(5, 6, 14, 12, hr);
  // 肩と制服
  px(3, 19, 18, 5, su);
  px(3, 22, 18, 2, ss);
  px(9, 18, 6, 2, sh); // 首
  px(9, 19, 2, 2, '#ffffff33');
  px(13, 19, 2, 2, '#ffffff33');
  px(11, 20, 2, 4, ss); // 襟の合わせ
  // 顔
  px(7, 7, 10, 11, sk);
  px(8, 6, 8, 1, sk);
  px(8, 18, 8, 1, sh);
  px(7, 16, 1, 2, sh);
  px(16, 16, 1, 2, sh);
  px(6, 11, 1, 3, sk); // 耳
  px(17, 11, 1, 3, sk);
  // 目・眉・口
  px(9, 12, 2, 2, EYES[l.eyes]);
  px(13, 12, 2, 2, EYES[l.eyes]);
  px(9, 12, 1, 1, '#ffffff88');
  px(13, 12, 1, 1, '#ffffff88');
  px(9, 10, 2, 1, hr);
  px(13, 10, 2, 1, hr);
  px(11, 15, 2, 1, sh);
  px(10, 16, 4, 1, '#00000022');
  // 前髪
  switch (l.hairStyle) {
    case 0: // 短髪
      px(7, 4, 10, 3, hr); px(6, 5, 1, 5, hr); px(17, 5, 1, 5, hr); px(8, 7, 3, 1, hr);
      break;
    case 1: // まとめ髪
      px(7, 4, 10, 3, hr); px(6, 6, 1, 4, hr); px(17, 6, 1, 4, hr); px(17, 3, 3, 3, hr); px(12, 7, 5, 1, hr);
      break;
    case 2: // 長髪
      px(7, 4, 10, 3, hr); px(6, 5, 2, 12, hr); px(16, 5, 2, 12, hr); px(9, 7, 6, 1, hr);
      break;
    default: // 刈り上げ
      px(7, 5, 10, 2, hr); px(6, 6, 1, 3, hr); px(17, 6, 1, 3, hr);
      px(14, 14, 3, 1, sh); // 頬の傷
  }
}

const cache = new Map<string, string>();

export function portraitURL(l: Look, scale = 6): string {
  const key = JSON.stringify(l) + scale;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 24 * scale;
  c.height = 24 * scale;
  const g = c.getContext('2d')!;
  drawPortrait((x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * scale, y * scale, w * scale, h * scale); }, l);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

// 見取り図用の小さな乗員（8×10ドット）
export function drawMini(g: CanvasRenderingContext2D, l: Look, x: number, y: number, s: number, frame: number) {
  const px = (a: number, b: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x + a * s), Math.round(y + b * s), Math.ceil(w * s), Math.ceil(h * s)); };
  px(1, 9, 6, 1, 'rgba(0,0,0,0.35)');
  px(2, 0, 4, 1, HAIR[l.hair]);
  px(1, 1, 6, 3, SKIN[l.skin]);
  px(1, 1, 6, 1, HAIR[l.hair]);
  if (l.hairStyle === 2) { px(1, 1, 1, 3, HAIR[l.hair]); px(6, 1, 1, 3, HAIR[l.hair]); }
  px(2, 2, 1, 1, EYES[l.eyes]);
  px(5, 2, 1, 1, EYES[l.eyes]);
  px(1, 4, 6, 3, SUIT[l.suit]);
  px(0, 4, 1, 2, SUIT_SH[l.suit]);
  px(7, 4, 1, 2, SUIT_SH[l.suit]);
  const step = frame % 2;
  px(2, 7, 1, 2 - step, '#2a2a36');
  px(5, 7, 1, 1 + step, '#2a2a36');
}

export const SUIT_COLORS = SUIT;
