// 仮説の提出フォーム。ボードの線からは採点しない。ここで選んだ構造化仮説だけを判定する。
import { h } from './dom';
import { confirmSheet } from './dom';
import type { ViewModel } from '../view/view';
import type { CrewId, Hypothesis, PlanKind } from '../core/types';

interface Draft {
  category: Hypothesis['category'] | null;
  cause: string | null;
  order: string[];
  person: CrewId | '';
  role: 'falsified' | 'sabotage';
  evidence: string[];
  plan: PlanKind | null;
}
let draft: Draft | null = null;

const CATS: [Hypothesis['category'], string][] = [
  ['accident', '事故・故障'], ['sabotage', '工作・犯罪'], ['phenomenon', '未知の現象'],
];

export function renderHypothesis(v: ViewModel, cb: { submit: (h: Hypothesis) => void; close: () => void }): HTMLElement {
  if (!draft || draft.order.length !== v.form.orderCards.length) {
    draft = { category: null, cause: null, order: v.form.orderCards.map((c) => c.id), person: '', role: 'falsified', evidence: [], plan: null };
  }
  const d = draft;
  const root = h('div', {});
  const rerender = () => root.replaceWith(renderHypothesis(v, cb));
  const radio = (name: string, checked: boolean, onchange: () => void, label: Node | string, warn?: string) =>
    h('label', { class: 'radio' }, h('input', { type: 'radio', name, checked, onchange }), h('span', {}, label, warn ? h('span', { class: 'warn' }, '⚠ ' + warn) : null));

  const labelOf = (id: string) => v.form.orderCards.find((c) => c.id === id)!.label;
  const moveOrder = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= d.order.length) return;
    [d.order[i], d.order[j]] = [d.order[j], d.order[i]];
    rerender();
  };

  const done = v.remaining <= 0;
  root.appendChild(h('div', {},
    h('p', { class: 'small muted', style: { margin: '0 0 6px' } }, `提出すると作戦が発令される。正誤はその場では示されず、現場の結果として返ってくる。残り ${v.remaining} 回。`),
    v.submissions ? h('p', { class: 'small' }, `提出済み ${v.submissions} 回。`) : null,

    h('div', { class: 'form-sec' }, h('h3', {}, '1. 原因の種類'),
      CATS.map(([id, l]) => radio('cat', d.category === id, () => { d.category = id; }, l))),

    h('div', { class: 'form-sec' }, h('h3', {}, '2. 原因となった具体的な出来事'),
      v.form.causes.map((c) => radio('cause', d.cause === c.id, () => { d.cause = c.id; }, c.label))),

    h('div', { class: 'form-sec' }, h('h3', {}, '3. 出来事の順番（上が先）'),
      d.order.map((id, i) => h('div', { class: 'order-row' },
        h('span', { class: 'n' }, i + 1), h('span', { class: 'lbl' }, labelOf(id)),
        h('button', { 'aria-label': '上へ', disabled: i === 0, onclick: () => moveOrder(i, -1) }, '↑'),
        h('button', { 'aria-label': '下へ', disabled: i === d.order.length - 1, onclick: () => moveOrder(i, 1) }, '↓')))),

    h('div', { class: 'form-sec' }, h('h3', {}, '4. 関係人物（いなければ「該当なし」）'),
      h('select', { onchange: (e: any) => { d.person = e.target.value; } },
        h('option', { value: '', selected: d.person === '' }, '該当なし'),
        v.form.crew.map((c) => h('option', { value: c.id, selected: d.person === c.id }, c.name))),
      h('div', { style: { marginTop: '6px' } },
        radio('role', d.role === 'falsified', () => { d.role = 'falsified'; }, '事実を偽った・隠した'),
        radio('role', d.role === 'sabotage', () => { d.role = 'sabotage'; }, '意図的に工作した'))),

    h('div', { class: 'form-sec' }, h('h3', {}, `5. 根拠にする主な証拠（最大4つ・${d.evidence.length}件選択）`),
      v.evidence.map((e) => h('label', { class: 'radio' },
        h('input', { type: 'checkbox', checked: d.evidence.includes(e.id), onchange: (ev: any) => {
          if (ev.target.checked) { if (d.evidence.length >= 4) { ev.target.checked = false; return; } d.evidence.push(e.id); }
          else d.evidence = d.evidence.filter((x) => x !== e.id);
          rerender();
        } }),
        h('span', {}, h('b', {}, e.title), h('span', { class: 'small muted' }, `（${e.sourceLabel}）`))))),

    h('div', { class: 'form-sec' }, h('h3', {}, '6. 対処（作戦）'),
      v.form.plans.map((p) => radio('plan', d.plan === p.id, () => { d.plan = p.id; }, p.label, p.warn))),

    h('button', { class: 'btn primary', disabled: done, onclick: () => {
      if (!(d.category && d.cause && d.plan)) { alertMissing(); return; }
      const hyp: Hypothesis = {
        category: d.category, cause: d.cause, order: [...d.order],
        person: d.person ? { crew: d.person, role: d.role } : null,
        evidence: [...d.evidence], plan: d.plan,
      };
      confirmSheet('仮説を提出する', `作戦を発令します。提出は残り${v.remaining}回${v.remaining === 1 ? '（これが最後です。作戦の結果が出た時点で事件が確定します）' : ''}。`, '提出して発令', () => cb.submit(hyp), false);
    } }, done ? '提出回数を使い切った' : '仮説を提出して作戦を発令'),
    h('div', { style: { height: '12px' } }),
    h('button', { class: 'btn ' + (v.resolved ? 'primary' : 'danger'), disabled: v.submissions === 0 && !v.resolved, onclick: () => cb.close() },
      v.resolved ? '事件を締めくくる' : '調査を打ち切って事件を確定'),
    v.submissions === 0 ? h('p', { class: 'small muted' }, '事件を確定するには、少なくとも1回は仮説を提出する。') : null,
  ));
  return root;
}

function alertMissing() {
  confirmSheet('未選択の項目', '「原因の種類」「具体的な出来事」「対処」を選んでください。', 'わかった', () => {}, false);
}

export function resetDraft() { draft = null; }
