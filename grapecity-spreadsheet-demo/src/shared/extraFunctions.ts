/**
 * Spreadsheet functions that fast-formula-parser 1.0.19 (the engine inside
 * react-spreadsheet) doesn't implement, or that misbehave there. Registered in both routes so the
 * same formulas work everywhere. Semantics follow Excel: range arguments
 * ignore text and blanks for numeric functions.
 */
import { FormulaError, type FunctionArg } from 'fast-formula-parser';

type Fn = (...args: FunctionArg[]) => unknown;

const flat = (a: FunctionArg | undefined): unknown[] => (!a ? [] : Array.isArray(a.value) ? (a.value as unknown[][]).flat() : [a.value]);
const isBlank = (v: unknown) => v === null || v === undefined || v === '';

/** Numbers from the arguments: ranges contribute only numeric cells; direct arguments are coerced. */
function numbers(args: FunctionArg[]): number[] {
  return args.flatMap((a) =>
    a.isRangeRef || Array.isArray(a.value)
      ? flat(a).filter((v): v is number => typeof v === 'number')
      : isBlank(a.value) ? [] : [Number(a.value)].filter(Number.isFinite),
  );
}

const scalar = (a: FunctionArg | undefined) => (a ? (Array.isArray(a.value) ? (a.value as unknown[][])[0]?.[0] : a.value) : undefined);
const num = (a: FunctionArg | undefined) => {
  const n = Number(scalar(a));
  if (!Number.isFinite(n)) throw FormulaError.VALUE;
  return n;
};

/** Criteria like 5, "Computers", ">5000", "<=3", "<>Audio". */
function matcher(criteria: unknown): (v: unknown) => boolean {
  const text = String(criteria ?? '');
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(text)!;
  const op = m[1] ?? '=';
  const target = m[2];
  const n = Number(target);
  const numeric = target.trim() !== '' && Number.isFinite(n);
  return (v) => {
    if (numeric && typeof v === 'number') {
      return { '=': v === n, '<>': v !== n, '<': v < n, '>': v > n, '<=': v <= n, '>=': v >= n }[op]!;
    }
    const s = String(v ?? '').toLowerCase();
    const t = target.toLowerCase();
    return op === '<>' ? s !== t : op === '=' ? s === t : false;
  };
}

/** Rows (by flat index) that satisfy every criteria pair. */
function matchingIndexes(pairs: FunctionArg[]): number[] {
  if (pairs.length % 2) throw FormulaError.VALUE;
  const tests: { values: unknown[]; test: (v: unknown) => boolean }[] = [];
  for (let i = 0; i < pairs.length; i += 2) tests.push({ values: flat(pairs[i]), test: matcher(scalar(pairs[i + 1])) });
  const size = tests[0]?.values.length ?? 0;
  return Array.from({ length: size }, (_, i) => i).filter((i) => tests.every((t) => t.test(t.values[i])));
}

const sorted = (args: FunctionArg[]) => numbers(args).sort((a, b) => a - b);

const FUNCTIONS: Record<string, Fn> = {
  MIN: (...args) => {
    const n = numbers(args);
    return n.length ? Math.min(...n) : 0;
  },
  MAX: (...args) => {
    const n = numbers(args);
    return n.length ? Math.max(...n) : 0;
  },
  COUNTA: (...args) => args.flatMap(flat).filter((v) => !isBlank(v)).length,
  COUNTBLANK: (range) => flat(range).filter(isBlank).length,
  UPPER: (text) => String(scalar(text) ?? '').toUpperCase(),
  MEDIAN: (...args) => {
    const n = sorted(args);
    if (!n.length) throw FormulaError.NUM;
    const mid = Math.floor(n.length / 2);
    return n.length % 2 ? n[mid] : (n[mid - 1] + n[mid]) / 2;
  },
  LARGE: (range, k) => {
    const n = sorted([range]);
    const i = n.length - num(k);
    if (i < 0 || i >= n.length) throw FormulaError.NUM;
    return n[i];
  },
  SMALL: (range, k) => {
    const n = sorted([range]);
    const i = num(k) - 1;
    if (i < 0 || i >= n.length) throw FormulaError.NUM;
    return n[i];
  },
  RANK: (value, range, order) => {
    const v = num(value);
    const n = numbers([range]);
    if (!n.includes(v)) throw FormulaError.NA;
    const ascending = order !== undefined && num(order) !== 0;
    return 1 + n.filter((x) => (ascending ? x < v : x > v)).length;
  },
  /** MATCH(lookup, range, [type]): 0 = exact, 1 = largest ≤ (ascending), -1 = smallest ≥ (descending). */
  MATCH: (lookup, range, type) => {
    const target = scalar(lookup);
    const values = flat(range);
    const mode = type === undefined ? 1 : num(type);
    let index = -1;
    if (mode === 0) {
      index = values.findIndex((v) => (typeof v === 'string' && typeof target === 'string' ? v.toLowerCase() === target.toLowerCase() : v === target));
    } else {
      values.forEach((v, i) => {
        if (typeof v !== typeof target || isBlank(v)) return;
        if (mode > 0 ? (v as number) <= (target as number) : (v as number) >= (target as number)) index = i;
      });
    }
    if (index < 0) throw FormulaError.NA;
    return index + 1;
  },
  TEXTJOIN: (delimiter, ignoreEmpty, ...texts) => {
    const skip = Boolean(scalar(ignoreEmpty));
    return texts.flatMap(flat).filter((v) => !(skip && isBlank(v))).map((v) => String(v ?? '')).join(String(scalar(delimiter) ?? ''));
  },
  // Single-criteria versions: replace the built-ins, which fail inside react-spreadsheet.
  SUMIF: (range, criteria, sumRange) => {
    const values = flat(sumRange ?? range);
    return matchingIndexes([range, criteria]).reduce((s, i) => s + (typeof values[i] === 'number' ? (values[i] as number) : 0), 0);
  },
  COUNTIF: (range, criteria) => matchingIndexes([range, criteria]).length,
  AVERAGEIF: (range, criteria, avgRange) => {
    const values = flat(avgRange ?? range);
    const n = matchingIndexes([range, criteria]).map((i) => values[i]).filter((v): v is number => typeof v === 'number');
    if (!n.length) throw FormulaError.DIV0;
    return n.reduce((a, b) => a + b, 0) / n.length;
  },
  SUMIFS: (sumRange, ...criteria) => {
    const values = flat(sumRange);
    return matchingIndexes(criteria).reduce((s, i) => s + (typeof values[i] === 'number' ? (values[i] as number) : 0), 0);
  },
  COUNTIFS: (...criteria) => matchingIndexes(criteria).length,
  AVERAGEIFS: (avgRange, ...criteria) => {
    const values = flat(avgRange);
    const n = matchingIndexes(criteria).map((i) => values[i]).filter((v): v is number => typeof v === 'number');
    if (!n.length) throw FormulaError.DIV0;
    return n.reduce((a, b) => a + b, 0) / n.length;
  },
  MAXIFS: (maxRange, ...criteria) => {
    const values = flat(maxRange);
    const n = matchingIndexes(criteria).map((i) => values[i]).filter((v): v is number => typeof v === 'number');
    return n.length ? Math.max(...n) : 0;
  },
  MINIFS: (minRange, ...criteria) => {
    const values = flat(minRange);
    const n = matchingIndexes(criteria).map((i) => values[i]).filter((v): v is number => typeof v === 'number');
    return n.length ? Math.min(...n) : 0;
  },
};

/**
 * A few built-in names (SUMIF, AVERAGEIF) are called with the parser context
 * first and raw `{ ref }` references instead of values. Resolve those through
 * the context's own onCell/onRange so every function sees plain arguments.
 */
interface ParserContext {
  onCell: (ref: unknown) => unknown;
  onRange: (ref: unknown) => unknown[][];
}
const isContext = (a: unknown): a is ParserContext => !!a && typeof a === 'object' && typeof (a as ParserContext).onRange === 'function';

function normalize(args: unknown[]): FunctionArg[] {
  if (!isContext(args[0])) return args as FunctionArg[];
  const ctx = args[0];
  return args.slice(1).map((a): FunctionArg => {
    if (a && typeof a === 'object' && 'ref' in a) {
      const ref = (a as { ref: { from?: unknown } }).ref;
      return ref.from ? { value: ctx.onRange(ref), isRangeRef: true } : { value: ctx.onCell(ref), isCellRef: true };
    }
    if (a && typeof a === 'object' && 'value' in a) return a as FunctionArg;
    return { value: a };
  });
}

export const EXTRA_FUNCTIONS: Record<string, Fn> = Object.fromEntries(
  Object.entries(FUNCTIONS).map(([name, fn]) => [name, (...args: unknown[]) => fn(...normalize(args))]),
);
