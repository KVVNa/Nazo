// 乗員の候補。航海ごとに機関士・医務官＋4人を選び、名前と顔を振る。
import type { Skill } from '../core/types';
import type { CrewSeed } from './case_api';

interface RoleDef { roleId: string; role: string; skills: Record<Skill, number>; histories: string[]; suit: number }

export const ROLES: RoleDef[] = [
  { roleId: 'engineer', role: '機関士', skills: { mech: 3, med: 0, inv: 1 }, histories: ['採掘船の機関部に12年', '造船所の検査員から転職'], suit: 0 },
  { roleId: 'medic', role: '医務官', skills: { mech: 0, med: 3, inv: 2 }, histories: ['救急救命室の看護師出身', '軍の衛生兵を経て民間船へ'], suit: 2 },
  { roleId: 'navigator', role: '航法士', skills: { mech: 1, med: 0, inv: 2 }, histories: ['航法学校を今年卒業', '観測船の航法士を8年'], suit: 1 },
  { roleId: 'security', role: '保安員', skills: { mech: 1, med: 1, inv: 2 }, histories: ['港湾警備を経て乗船3年目', '元・税関の検査官'], suit: 3 },
  { roleId: 'comms', role: '通信士', skills: { mech: 2, med: 0, inv: 2 }, histories: ['中継局の保守要員あがり', '無線愛好家から通信士に'], suit: 1 },
  { roleId: 'scientist', role: '科学士官', skills: { mech: 1, med: 1, inv: 3 }, histories: ['小惑星探査の研究員', '大学の研究室から出向中'], suit: 2 },
  { roleId: 'cook', role: '司厨員', skills: { mech: 1, med: 1, inv: 1 }, histories: ['港町の食堂を畳んで乗船', '客船の厨房に10年'], suit: 3 },
  { roleId: 'cargo', role: '荷役担当', skills: { mech: 2, med: 0, inv: 1 }, histories: ['宇宙港の荷役を15年', '倉庫管理の仕事から転職'], suit: 0 },
];

import { CREW8_NAMES } from '../voyage/crew8';

export const NAMES = ['ミナ', 'ソラ', 'ケイ', 'ドゥラン', 'リオ', 'アマラ', 'ユーリ', 'ハナ', 'テオ', 'ナディア', 'ジン', 'サナ', 'オルガ', 'カイ', 'ルカ', 'エマ', 'イサク', 'ノア'];

// 検証器が「その回にいない名前」を探すときに使う全候補
export const ALL_NAMES = [...NAMES, ...CREW8_NAMES];

export function pickCrew(rand: () => number, needRoles: string[] = [], n = 6): CrewSeed[] {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const want = new Set(['engineer', 'medic', ...needRoles]);
  const rest = shuffle(ROLES.filter((r) => !want.has(r.roleId)).map((r) => r.roleId));
  const roleIds = [...want, ...rest].slice(0, Math.max(n, want.size));
  const names = shuffle(NAMES);
  return roleIds.map((rid, i) => {
    const r = ROLES.find((x) => x.roleId === rid)!;
    const exp = r.roleId === 'engineer' ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
    return {
      id: 'c' + i,
      name: names[i],
      roleId: r.roleId,
      role: r.role,
      history: pick(r.histories),
      skills: { ...r.skills },
      exp,
      trust: 45 + Math.floor(rand() * 21),
      bold: rand() < 0.5,
      look: { skin: Math.floor(rand() * 4), hair: Math.floor(rand() * 4), hairStyle: Math.floor(rand() * 4), suit: r.suit, eyes: Math.floor(rand() * 2) },
    };
  });
}
