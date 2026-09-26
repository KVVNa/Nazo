// 航海モードの言い換え。単発の事件の文章は「寄港」や「太陽」を前提にしているが、
// 航海では寄港がなく（行き先は〈ハース〉への到着）、恒星は太陽ではない。
const WORDS: [RegExp, string][] = [
  [/次の寄港で/g, '到着したら'], [/次の寄港待ち/g, '到着待ち'], [/前の寄港で/g, '出港前に'],
  [/寄港後に/g, '到着後に'], [/寄港後/g, '到着後'], [/寄港まで/g, '到着まで'], [/寄港したら/g, '到着したら'], [/寄港の日/g, '到着の日'],
  [/港での検査/g, '到着後の検査'], [/港の検査/g, '到着後の検査'],
  [/運航会社/g, '本社'],
  [/太陽フレア/g, '恒星フレア'], [/太陽活動/g, '恒星の活動'], [/太陽/g, '恒星'],
];

export function voyageWords(t: string): string {
  for (const [a, b] of WORDS) t = t.replace(a, b);
  return t;
}

// 事件定義の中の文字列をすべて言い換える（関数はそのまま）
export function voyageDeep<T>(x: T): T {
  if (typeof x === 'string') return voyageWords(x) as unknown as T;
  if (Array.isArray(x)) return x.map((y) => voyageDeep(y)) as unknown as T;
  if (x && typeof x === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(x as any)) o[k] = typeof v === 'function' ? v : voyageDeep(v);
    return o;
  }
  return x;
}
