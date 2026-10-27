import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import Spreadsheet, { createFormulaParser, type CellBase, type DataViewerProps, type Matrix, type Mode } from 'react-spreadsheet';
import { EXTRA_FUNCTIONS } from '../shared/extraFunctions';
import { CategoryActions, ProductActions, StatusSelect, StatusSummary, TreeLabel } from '../shared/cells';
import { SalesWorkspace, type FormulaGridProps, type GridProps } from '../shared/SalesWorkspace';
import { FORMULA_COLS, formatValue, isError, isFormula, type FCell, type Value } from '../shared/formulaSheet';
import { int, money, type Product, type TreeRow } from '../shared/salesData';
import type { SalesActions } from '../shared/useSalesTree';
import './ReactSpreadsheetSheet.css';

const COLUMNS = ['Item', 'Units', 'Price', 'Total', 'Status', 'Actions'];
const C = { item: 0, units: 1, price: 2, total: 3, status: 4, actions: 5 } as const;

/** A spreadsheet cell that knows which tree row it belongs to. */
type Cell = CellBase & { row: TreeRow };

/** react-spreadsheet's engine plus the functions it lacks (MIN, MAX, COUNTA, MATCH, …). */
const withExtraFunctions = (data: Matrix<CellBase>) => createFormulaParser(data, { functions: EXTRA_FUNCTIONS });

const Ctx = createContext<{ actions: SalesActions; openProduct: (id: string) => void } | null>(null);
const useGrid = () => useContext(Ctx)!;

// ---- cell viewers (module-level so React keeps them mounted) --------------------

function ItemViewer({ cell }: DataViewerProps<Cell>) {
  const { actions } = useGrid();
  const row = cell?.row;
  if (!row) return null;
  if (row.kind === 'category') {
    return <div className="rs-cell"><TreeLabel kind="category" name={row.name} count={row.childCount} expanded={row.expanded} onToggle={() => actions.toggle(row.category)} /></div>;
  }
  if (row.kind === 'total') return <div className="rs-cell"><strong>Total</strong></div>;
  return <div className="rs-cell"><TreeLabel kind="product" name={String(cell.value ?? '')} /></div>;
}

/** Number cells show the formula's evaluated value, formatted. */
function NumberViewer({ cell, evaluatedCell, column }: DataViewerProps<Cell>) {
  const v = evaluatedCell?.value;
  if (v === '' || v === null || v === undefined) return <div className="rs-cell" />;
  const n = Number(v);
  const text = Number.isFinite(n) ? (column === C.units ? int(n) : money(n)) : String(v);
  return <div className={`rs-cell rs-num${cell?.row.kind !== 'product' ? ' rs-strong' : ''}`}>{text}</div>;
}

function StatusViewer({ cell }: DataViewerProps<Cell>) {
  const { actions } = useGrid();
  const row = cell?.row;
  if (row?.kind === 'product') return <div className="rs-cell"><StatusSelect value={row.status} onChange={(status) => actions.update(row.id, { status })} /></div>;
  if (row?.kind === 'category') return <div className="rs-cell"><StatusSummary counts={row.statusCounts} /></div>;
  return null;
}

function ActionsViewer({ cell }: DataViewerProps<Cell>) {
  const { actions, openProduct } = useGrid();
  const row = cell?.row;
  if (row?.kind === 'product') {
    return <div className="rs-cell"><ProductActions onView={() => openProduct(row.id)} onDuplicate={() => actions.duplicate(row.id)} onDelete={() => actions.remove(row.id)} /></div>;
  }
  if (row?.kind === 'category') return <div className="rs-cell"><CategoryActions onAdd={() => actions.add(row.category)} /></div>;
  return null;
}

// ---- tree rows → spreadsheet matrix -------------------------------------------------

/**
 * Builds the matrix with live formulas: each product's Total is =Units*Price,
 * an expanded category sums its visible children, and the last row adds up
 * the categories. Collapsed categories hold their computed sums.
 */
function toMatrix(rows: TreeRow[], total: TreeRow): Matrix<Cell> {
  const all = [...rows, total];
  const ref = (col: string, i: number) => `${col}${i + 1}`;
  const matrix: Matrix<Cell> = [];
  all.forEach((row, i) => {
    const ro = (value: unknown, viewer: (p: DataViewerProps<Cell>) => JSX.Element | null = NumberViewer): Cell => ({ value, readOnly: true, row, DataViewer: viewer as Cell['DataViewer'], className: `rs-${row.kind}` });
    if (row.kind === 'product') {
      matrix.push([
        { value: row.name, row, DataViewer: ItemViewer as Cell['DataViewer'], className: 'rs-product' },
        { value: row.units, row, DataViewer: NumberViewer as Cell['DataViewer'], className: 'rs-product rs-edit' },
        { value: row.price, row, DataViewer: NumberViewer as Cell['DataViewer'], className: 'rs-product rs-edit' },
        ro(`=${ref('B', i)}*${ref('C', i)}`),
        ro(row.status, StatusViewer),
        ro('', ActionsViewer),
      ]);
      return;
    }
    if (row.kind === 'category') {
      const sum = (col: string, fallback: number) =>
        row.expanded && row.childCount ? `=SUM(${ref(col, i + 1)}:${ref(col, i + row.childCount)})` : fallback;
      matrix.push([ro(row.name, ItemViewer), ro(sum('B', row.units)), ro(''), ro(sum('D', row.total)), ro('', StatusViewer), ro('', ActionsViewer)]);
      return;
    }
    const cats = rows.map((r, j) => (r.kind === 'category' ? j : -1)).filter((j) => j >= 0);
    const add = (col: string) => (cats.length ? `=${cats.map((j) => ref(col, j)).join('+')}` : 0);
    matrix.push([ro('Total', ItemViewer), ro(add('B')), ro(''), ro(add('D')), ro(''), ro('', ActionsViewer)]);
  });
  return matrix;
}

/**
 * react-spreadsheet reports every keystroke while a cell is being edited.
 * Buffer those and commit once when editing ends, so one edit = one change;
 * changes made in view mode (paste, Delete key) apply right away.
 */
function useBufferedChange<T>(apply: (next: Matrix<T>) => void) {
  const mode = useRef<Mode>('view');
  const pending = useRef<Matrix<T> | null>(null);
  const flush = useCallback(() => {
    setTimeout(() => {
      if (mode.current === 'edit' || !pending.current) return;
      const next = pending.current;
      pending.current = null;
      apply(next);
    });
  }, [apply]);
  const onChange = useCallback(
    (next: Matrix<T>) => {
      pending.current = next;
      flush();
    },
    [flush],
  );
  const onModeChange = useCallback(
    (m: Mode) => {
      mode.current = m;
      if (m === 'view') flush();
    },
    [flush],
  );
  return { onChange, onModeChange };
}

function SpreadsheetGrid({ model, openProduct }: GridProps) {
  const { rows, total, actions } = model;
  const data = useMemo(() => toMatrix(rows, total), [rows, total]);
  // react-spreadsheet also calls onChange when it adopts new `data` (e.g. after
  // undo); comparing against the latest rows makes that echo a no-op.
  const latest = useRef(rows);
  latest.current = rows;

  // Map edited cells back to products.
  const apply = useCallback(
    (next: Matrix<Cell>) => {
      const patches: { id: string; patch: Partial<Product> }[] = [];
      latest.current.forEach((row, i) => {
        if (row.kind !== 'product') return;
        const name = String(next[i]?.[C.item]?.value ?? '').trim();
        const units = Number(next[i]?.[C.units]?.value);
        const price = Number(next[i]?.[C.price]?.value);
        const patch: Partial<Product> = {};
        if (name && name !== row.name) patch.name = name;
        if (Number.isFinite(units) && units >= 0 && units !== row.units) patch.units = Math.round(units);
        if (Number.isFinite(price) && price >= 0 && price !== row.price) patch.price = price;
        if (Object.keys(patch).length) patches.push({ id: row.id, patch });
      });
      if (patches.length) actions.updateMany(patches);
    },
    [actions],
  );

  const { onChange, onModeChange } = useBufferedChange(apply);

  const ctx = useMemo(() => ({ actions, openProduct }), [actions, openProduct]);

  return (
    <Ctx.Provider value={ctx}>
      <div className="rs-scroll">
        <Spreadsheet data={data} onChange={onChange as (d: Matrix<CellBase>) => void} onModeChange={onModeChange} createFormulaParser={withExtraFunctions} columnLabels={COLUMNS} className="rs-sheet rs-sales" />
      </div>
    </Ctx.Provider>
  );
}

// ---- Formulas sheet -------------------------------------------------------------

type FormulaCell = CellBase & { f: FCell };

/** Formats the value react-spreadsheet's own formula engine computed. */
function FormulaViewer({ cell, evaluatedCell }: DataViewerProps<FormulaCell>) {
  const v = evaluatedCell?.value as Value;
  const fmt = cell?.f.fmt;
  const numeric = typeof v === 'number';
  return (
    <div className={`rs-cell${numeric ? ' rs-num' : ''}${isError(v) ? ' rs-error' : ''}`} title={cell && (isFormula(cell.f.raw) || cell.f.style === 'code') ? String(cell.f.raw) : undefined}>
      {formatValue(v, fmt)}
    </div>
  );
}

function FormulaGrid({ cells, setCells, onSelect }: FormulaGridProps) {
  const data = useMemo<Matrix<FormulaCell>>(
    () => cells.map((row) => row.map((f) => ({ value: f.raw ?? '', readOnly: !f.key, f, className: `fx-${f.style}`, DataViewer: FormulaViewer as FormulaCell['DataViewer'] }))),
    [cells],
  );
  const latest = useRef(cells);
  latest.current = cells;

  const apply = useCallback(
    (next: Matrix<FormulaCell>) => {
      const edits: { key: string; raw: string }[] = [];
      latest.current.forEach((row, r) =>
        row.forEach((f, c) => {
          if (!f.key) return;
          const raw = String(next[r]?.[c]?.value ?? '');
          if (raw !== String(f.raw ?? '')) edits.push({ key: f.key, raw });
        }),
      );
      setCells(edits);
    },
    [setCells],
  );
  const { onChange, onModeChange } = useBufferedChange(apply);

  return (
    <div className="rs-scroll">
      <Spreadsheet
        data={data}
        onChange={onChange as (d: Matrix<CellBase>) => void}
        onModeChange={onModeChange}
        onActivate={(p) => onSelect(p.row, p.column)}
        createFormulaParser={withExtraFunctions}
        columnLabels={FORMULA_COLS}
        className="rs-sheet rs-formulas"
      />
    </div>
  );
}

export default function ReactSpreadsheetSheet() {
  return (
    <SalesWorkspace
      library="react-spreadsheet"
      renderGrid={(props) => <SpreadsheetGrid {...props} />}
      renderFormulas={(props) => <FormulaGrid {...props} />}
    />
  );
}
