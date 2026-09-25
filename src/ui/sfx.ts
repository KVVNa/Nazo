// 短い効果音（WebAudioで合成。音声ファイルなし）
let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', vol = 0.05) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function play(kind: string) {
  if (!ctx) return;
  switch (kind) {
    case 'alarm': tone(660, 0, 0.18); tone(440, 0.2, 0.18); tone(660, 0.4, 0.18); tone(440, 0.6, 0.22); break;
    case 'report': tone(1320, 0, 0.06, 'sine', 0.06); tone(1760, 0.07, 0.08, 'sine', 0.05); break;
    case 'success': tone(523, 0, 0.12, 'triangle', 0.07); tone(659, 0.12, 0.12, 'triangle', 0.07); tone(784, 0.24, 0.25, 'triangle', 0.07); break;
    case 'tap': tone(900, 0, 0.03, 'square', 0.02); break;
  }
}
