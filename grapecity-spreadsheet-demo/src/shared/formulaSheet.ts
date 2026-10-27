/**
 * The second sheet, "Formulas": a live copy of the Sales products plus worked
 * examples of basic spreadsheet functions and a scratch area for your own
 * formulas. Shared by both routes; `evaluateSheet` (fast-formula-parser, the
 * engine react-spreadsheet uses internally) computes values for AG Grid and
 * for exports.
 */
import FormulaParser from 'fast-formula-parser';
import { int, money, type Product } from './salesData';
import { EXTRA_FUNCTIONS } from './extraFunctions';

export const FORMULA_COLS = ['A', 'B', 'C', 'D', 'E', 'F'];

export type Fmt = 'money' | 'int' | 'pct' | 'text';
export type FStyle = 'header' | 'section' | 'data' | 'label' | 'code' | 'result' | 'input' | 'hint' | 'blank';
export type Raw = string | number | null;
export type Value = string | number | boolean | null;

export interface FCell {
  raw: Raw;
  style: FStyle;
  fmt?: Fmt;
  /** Present on editable cells: the key their edits are stored under. */
  key?: string;
}

/** User edits, keyed by `FCell.key`. */
export type Overrides = Record<string, string>;

export const cellAddress = (r: number, c: number) => `${FORMULA_COLS[c]}${r + 1}`;
export const isFormula = (raw: Raw): raw is string => typeof raw === 'string' && raw.startsWith('=');

/** Typed numbers become numbers; everything else stays text. */
const parseInput = (text: string): Raw => (text.trim() !== '' && Number.isFinite(Number(text)) && !isFormula(text) ? Number(text) : text === '' ? null : text);

interface FunctionRow {
  label: string;
  fmt: Fmt;
  formula: (r: (col: string) => string) => string;
}

/** Worked examples; `r('E')` is the Sales range of a column, e.g. E2:E11. */
const FUNCTIONS: FunctionRow[] = [
  { label: 'Total revenue', fmt: 'money', formula: (r) => `SUM(${r('E')})` },
  { label: 'Average price', fmt: 'money', formula: (r) => `AVERAGE(${r('D')})` },
  { label: 'Median price', fmt: 'money', formula: (r) => `MEDIAN(${r('D')})` },
  { label: 'Smallest total', fmt: 'money', formula: (r) => `MIN(${r('E')})` },
  { label: 'Largest total', fmt: 'money', formula: (r) => `MAX(${r('E')})` },
  { label: '2nd largest total', fmt: 'money', formula: (r) => `LARGE(${r('E')},2)` },
  { label: 'Numeric unit cells', fmt: 'int', formula: (r) => `COUNT(${r('C')})` },
  { label: 'Products', fmt: 'int', formula: (r) => `COUNTA(${r('A')})` },
  { label: 'Computers revenue', fmt: 'money', formula: (r) => `SUMIF(${r('B')},"Computers",${r('E')})` },
  { label: 'Out of stock items', fmt: 'int', formula: (r) => `COUNTIF(${r('F')},"Out of stock")` },
  { label: 'Accessories in stock', fmt: 'money', formula: (r) => `SUMIFS(${r('E')},${r('B')},"Accessories",${r('F')},"In stock")` },
  { label: 'Avg Accessories price', fmt: 'money', formula: (r) => `AVERAGEIF(${r('B')},"Accessories",${r('D')})` },
  { label: 'Average total, rounded', fmt: 'money', formula: (r) => `ROUND(AVERAGE(${r('E')}),0)` },
  { label: 'Target check', fmt: 'text', formula: (r) => `IF(SUM(${r('E')})>=50000,"Target met","Below target")` },
  { label: 'Best seller', fmt: 'text', formula: (r) => `INDEX(${r('A')},MATCH(MAX(${r('E')}),${r('E')},0))` },
  { label: 'Best seller share', fmt: 'pct', formula: (r) => `MAX(${r('E')})/SUM(${r('E')})` },
  { label: 'Summary text', fmt: 'text', formula: (r) => `CONCATENATE(COUNTA(${r('A')})," products, ",SUM(${r('C')})," units")` },
  { label: 'Upper-case category', fmt: 'text', formula: (r) => `UPPER(INDEX(${r('B')},1))` },
];

const SCRATCH_ROWS = 6;

export function buildFormulaSheet(products: Product[], overrides: Overrides): FCell[][] {
  const last = products.length + 1;
  const range = (col: string) => `${col}2:${col}${last}`;
  const blank = (style: FStyle = 'blank'): FCell => ({ raw: null, style });
  const row = (cells: FCell[]) => [...cells, ...Array.from({ length: FORMULA_COLS.length - cells.length }, () => blank())];
  const rows: FCell[][] = [];

  // 1. Live copy of the Sales data (read-only; edit it on the Sales sheet).
  rows.push(['Product', 'Category', 'Units', 'Price', 'Total', 'Status'].map((h) => ({ raw: h, style: 'header' })));
  products.forEach((p, i) => {
    const r = i + 2;
    rows.push([
      { raw: p.name, style: 'data' },
      { raw: p.category, style: 'data' },
      { raw: p.units, style: 'data', fmt: 'int' },
      { raw: p.price, style: 'data', fmt: 'money' },
      { raw: `=C${r}*D${r}`, style: 'data', fmt: 'money' },
      { raw: p.status, style: 'data' },
    ]);
  });
  rows.push(row([]));

  // 2. Function examples: label, formula text, result (editable).
  rows.push(row([{ raw: 'Functions', style: 'section' }, blank('section'), blank('section')]));
  rows.push(row(['Example', 'Formula', 'Result'].map((h) => ({ raw: h, style: 'header' }))));
  FUNCTIONS.forEach((f, i) => {
    const key = `fn:${i}`;
    const raw = key in overrides ? parseInput(overrides[key]) : `=${f.formula(range)}`;
    rows.push(row([
      { raw: f.label, style: 'label' },
      { raw: isFormula(raw) ? raw.slice(1) : '(value)', style: 'code' },
      { raw, style: 'result', fmt: f.fmt, key },
    ]));
  });
  rows.push(row([]));

  // 3. Scratch area: every cell is editable; two rows come pre-filled.
  rows.push(row([{ raw: 'Your formulas', style: 'section' }, blank('section'), blank('section'), blank('section')]));
  const start = rows.length;
  const defaults: Record<string, { raw: Raw; fmt?: Fmt }> = {
    's:0:0': { raw: 'Tax rate' },
    's:0:1': { raw: 0.18, fmt: 'pct' },
    's:0:2': { raw: 'Revenue + tax' },
    's:0:3': { raw: `=ROUND(SUM(${range('E')})*(1+B${start + 1}),2)`, fmt: 'money' },
    's:1:0': { raw: 'Units goal' },
    's:1:1': { raw: 300, fmt: 'int' },
    's:1:2': { raw: 'Goal reached?' },
    's:1:3': { raw: `=IF(SUM(${range('C')})>=B${start + 2},"Yes","Not yet")`, fmt: 'text' },
  };
  for (let i = 0; i < SCRATCH_ROWS; i++) {
    rows.push(
      FORMULA_COLS.map((_, c) => {
        const key = `s:${i}:${c}`;
        const preset = defaults[key];
        const raw = key in overrides ? parseInput(overrides[key]) : (preset?.raw ?? null);
        // Like Excel, a cell keeps its number format when you edit its value.
        return { raw, style: 'input', key, fmt: preset?.fmt };
      }),
    );
  }
  rows.push(row([{ raw: 'Tip: type a value, or a formula starting with =, in any yellow cell. Edit a selected cell in the formula bar.', style: 'hint' }]));
  return rows;
}

/**
 * Evaluates every formula. Formulas are re-evaluated in passes until values
 * stop changing (enough for this sheet's short dependency chains), which
 * avoids re-entering the parser from inside a lookup.
 */
export function evaluateSheet(cells: FCell[][]): Value[][] {
  const values: Value[][] = cells.map((row) => row.map((c) => (isFormula(c.raw) ? null : c.raw)));
  const at = (row: number, col: number): Value => values[row - 1]?.[col - 1] ?? null;
  const parser = new FormulaParser({
    onCell: ({ row, col }) => at(row, col),
    onRange: ({ from, to }) => {
      const out: Value[][] = [];
      for (let r = from.row; r <= Math.min(to.row, values.length); r++) {
        const line: Value[] = [];
        for (let c = from.col; c <= Math.min(to.col, FORMULA_COLS.length); c++) line.push(at(r, c));
        out.push(line);
      }
      return out;
    },
    functions: EXTRA_FUNCTIONS,
  });
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (!isFormula(cell.raw)) return;
        let v: Value;
        try {
          const out = parser.parse(cell.raw.slice(1), { sheet: 'Sheet1', row: r + 1, col: c + 1 });
          v = out !== null && typeof out === 'object' ? String((out as { error?: string }).error ?? '#VALUE!') : (out as Value);
        } catch (e) {
          v = String((e as { error?: string }).error ?? '#ERROR!');
        }
        if (v !== values[r][c]) {
          values[r][c] = v;
          changed = true;
        }
      }),
    );
    if (!changed) break;
  }
  return values;
}

export const isError = (v: Value) => typeof v === 'string' && v.startsWith('#');

/** Display text for a value, honoring the cell's format. */
export function formatValue(v: Value, fmt?: Fmt): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v !== 'number') return String(v);
  if (fmt === 'money') return money(v);
  if (fmt === 'int') return int(Math.round(v));
  if (fmt === 'pct') return `${(v * 100).toFixed(1)}%`;
  return Number.isInteger(v) ? int(v) : v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
