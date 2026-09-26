import { h } from './dom';
import type { ViewModel } from '../view/view';
import { portraitURL } from '../render/sprites';

const mark = (x: number) => (x >= 0.99 ? h('span', { class: 'mark-ok' }, '正しい') : x > 0.001 ? h('span', { class: 'mark-part' }, '一部') : h('span', { class: 'mark-ng' }, '誤り'));

export function renderResult(v: ViewModel, cb: { save: () => boolean; saved: () => boolean; title: () => void; voyage?: () => void }): HTMLElement {
  const r = v.result!;
  const cls = r.grade === '真相解明' ? 'good' : r.grade === '部分解明' ? 'mid' : 'bad';
  const j = r.judgement;
  const saveBtn = h('button', { class: 'btn primary', disabled: cb.saved() }, cb.saved() ? '事件記録に保存済み' : '事件記録に保存') as HTMLButtonElement;
  const saveMsg = h('p', { class: 'small muted' });
  saveBtn.addEventListener('click', () => {
    const ok = cb.save();
    saveBtn.disabled = true;
    saveBtn.textContent = ok ? '事件記録に保存済み' : '保存できなかった';
    saveMsg.textContent = ok ? '設定・事件記録から書き出せます。' : 'ブラウザの保存領域に書き込めませんでした。';
  });
  const planName = v.form.plans.find((p) => p.id === r.hyp?.plan)?.label;
  return h('div', { class: 'screen' },
    h('p', { class: 'muted small', style: { margin: 0 } }, `事件記録：${v.title}　${v.clock}`),
    h('div', { class: 'grade ' + cls }, r.shipLost ? '船は失われた' : r.grade),
    h('p', { style: { marginTop: 0 } }, r.reasonText + '。' + (r.resolved ? '危機は去った。' : '危機はまだ解けていない。')),

    h('div', { class: 'card' },
      h('h3', {}, '最後に提出した仮説の評価'),
      j ? [
        h('div', { class: 'res-row' }, '原因の種類', mark(j.parts.category)),
        h('div', { class: 'res-row' }, '具体的な原因', mark(j.parts.cause)),
        h('div', { class: 'res-row' }, '出来事の順番', mark(j.parts.order)),
        h('div', { class: 'res-row' }, '関係人物', mark(j.parts.person)),
        h('div', { class: 'res-row' }, '根拠の証拠', mark(j.parts.evidence)),
        h('div', { class: 'res-row' }, `対処（${planName}）`, mark(j.parts.plan)),
        h('div', { class: 'res-row' }, h('b', {}, '推理点'), h('b', {}, `${j.total} / 100`)),
      ] : h('p', { class: 'muted' }, '仮説は提出されなかった。')),

    h('div', { class: 'card' },
      h('h3', {}, '船と乗員'),
      h('div', { class: 'res-row' }, h('span', {}, '船体'), h('span', {}, `${r.hull}%`)),
      h('div', { class: 'res-row' }, h('span', {}, '酸素'), h('span', {}, `${r.o2}%`)),
      r.survivors.map((c) => {
        const face = v.crew.find((x) => x.id === c.id)!;
        return h('div', { class: 'res-row', style: { alignItems: 'center' } },
          h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('img', { src: portraitURL(face.look, 2), width: 32, height: 32, style: { imageRendering: 'pixelated', borderRadius: '4px', opacity: c.alive ? 1 : 0.35 } }), c.name),
          c.alive ? h('span', {}, `健康 ${c.health}%`) : h('span', { class: 'mark-ng' }, '死亡'));
      })),

    r.missed.length ? h('div', { class: 'card' },
      h('h3', {}, '見落とした手がかり'),
      r.missed.map((m) => h('div', { class: 'res-row' }, h('span', {}, m.title), h('span', { class: 'muted small', style: { textAlign: 'right' } }, m.where)))) : null,

    r.misleads.length ? h('div', { class: 'card' },
      h('h3', {}, '惑わされた手がかりの正体'),
      r.misleads.map((m) => h('p', { class: 'small', style: { margin: '6px 0' } }, m))) : null,

    r.truthLines ? h('div', { class: 'card' },
      h('h3', {}, '事件の経過（解明）'),
      r.truthLines.map((l) => h('p', { class: 'small', style: { margin: '4px 0' } }, l))) : null,

    h('div', { class: 'card' },
      h('h3', {}, 'その後'),
      r.epilogue.map((l) => h('p', { class: 'small', style: { margin: '6px 0' } }, l))),

    cb.voyage ? h('button', { class: 'btn primary', onclick: cb.voyage }, '航海に戻る') : [saveBtn, saveMsg, h('button', { class: 'btn', onclick: cb.title }, 'タイトルへ')],
    cb.voyage ? h('p', { class: 'small muted' }, 'この結果は航海に記録された。死んだ乗員は戻らない。') : null,
  );
}
