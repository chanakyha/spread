import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule, ModuleRegistry, themeQuartz,
  type ColDef, type ICellRendererParams, type RowClassRules, type ValueSetterParams,
} from 'ag-grid-community';
import { CategoryActions, ProductActions, StatusSelect, StatusSummary, TreeLabel } from '../shared/cells';
import { SalesWorkspace, type FormulaGridProps, type GridProps } from '../shared/SalesWorkspace';
import { FORMULA_COLS, formatValue, isError, isFormula, type FCell, type Value } from '../shared/formulaSheet';
import { int, money, type Product, type TreeRow } from '../shared/salesData';
import type { SalesActions } from '../shared/useSalesTree';
import './AgGridSheet.css';

// AG Grid Community (MIT). Tree data and Excel export are Enterprise
// features, so the tree is drawn by our own cell renderer and exports use exceljs.
ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 13,
  headerFontWeight: 600,
  headerBackgroundColor: '#111827',
  headerTextColor: '#ffffff',
  accentColor: '#4f46e5',
  borderColor: '#eef0f3',
  rowHoverColor: 'rgba(79, 70, 229, 0.04)',
  headerColumnResizeHandleColor: '#374151',
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  rowHeight: 44,
  headerHeight: 40,
});

interface Context {
  actions: SalesActions;
  openProduct: (id: string) => void;
}
type Params = ICellRendererParams<TreeRow, unknown, Context>;

function ItemRenderer({ data, context }: Params) {
  if (!data) return null;
  if (data.kind === 'category') return <TreeLabel kind="category" name={data.name} count={data.childCount} expanded={data.expanded} onToggle={() => context.actions.toggle(data.category)} />;
  if (data.kind === 'total') return <strong>Total</strong>;
  return <TreeLabel kind="product" name={data.name} />;
}

function StatusRenderer({ data, context }: Params) {
  if (data?.kind === 'product') return <StatusSelect value={data.status} onChange={(status) => context.actions.update(data.id, { status })} />;
  if (data?.kind === 'category') return <StatusSummary counts={data.statusCounts} />;
  return null;
}

function ActionsRenderer({ data, context }: Params) {
  if (data?.kind === 'product') {
    return <ProductActions onView={() => context.openProduct(data.id)} onDuplicate={() => context.actions.duplicate(data.id)} onDelete={() => context.actions.remove(data.id)} />;
  }
  if (data?.kind === 'category') return <CategoryActions onAdd={() => context.actions.add(data.category)} />;
  return null;
}

const isProduct = (p: { data?: TreeRow }) => p.data?.kind === 'product';

/** Edits go straight to the shared model; the grid re-renders from new rowData. */
const setter = (field: 'name' | 'units' | 'price') => (p: ValueSetterParams<TreeRow, unknown>) => {
  if (p.data?.kind !== 'product') return false;
  const ctx = p.context as Context;
  let value: Product[typeof field];
  if (field === 'name') {
    value = String(p.newValue ?? '').trim();
    if (!value) return false;
  } else {
    const n = Number(p.newValue);
    if (!Number.isFinite(n) || n < 0) return false;
    value = field === 'units' ? Math.round(n) : n;
  }
  ctx.actions.update(p.data.id, { [field]: value });
  return false; // rowData is replaced by the state update
};

const COLUMNS: ColDef<TreeRow>[] = [
  { headerName: 'Item', field: 'name', flex: 1, minWidth: 280, editable: isProduct, valueSetter: setter('name'), cellRenderer: ItemRenderer },
  { headerName: 'Units', field: 'units', width: 100, type: 'rightAligned', editable: isProduct, cellEditor: 'agNumberCellEditor', valueSetter: setter('units'), valueFormatter: (p) => int(Number(p.value ?? 0)) },
  {
    headerName: 'Price',
    colId: 'price',
    width: 130,
    type: 'rightAligned',
    editable: isProduct,
    cellEditor: 'agNumberCellEditor',
    valueGetter: (p) => (p.data?.kind === 'product' ? p.data.price : null),
    valueSetter: setter('price'),
    valueFormatter: (p) => (p.value === null || p.value === undefined ? '' : money(Number(p.value))),
  },
  { headerName: 'Total', field: 'total', width: 140, type: 'rightAligned', valueFormatter: (p) => money(Number(p.value ?? 0)), cellClass: (p) => (isProduct(p) ? '' : 'ag-strong') },
  { headerName: 'Status', colId: 'status', width: 190, cellRenderer: StatusRenderer },
  { headerName: 'Actions', colId: 'actions', width: 140, cellRenderer: ActionsRenderer, cellClass: 'ag-actions' },
];

const rowClassRules: RowClassRules<TreeRow> = {
  'ag-row-category': (p) => p.data?.kind === 'category',
  'ag-row-total': (p) => p.data?.kind === 'total',
};

function Grid({ model, openProduct }: GridProps) {
  const context = useMemo<Context>(() => ({ actions: model.actions, openProduct }), [model.actions, openProduct]);
  const pinned = useMemo(() => [model.total], [model.total]);
  return (
    <div className="ag-host">
      <AgGridReact<TreeRow>
        theme={theme}
        rowData={model.rows}
        columnDefs={COLUMNS}
        defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        pinnedBottomRowData={pinned}
        rowClassRules={rowClassRules}
        context={context}
        stopEditingWhenCellsLoseFocus
        suppressCellFocus={false}
        overlayNoRowsTemplate="No products match your search"
      />
    </div>
  );
}

// ---- Formulas sheet -------------------------------------------------------------
// AG Grid Community has no formula engine: cells hold the raw input (shown in
// the editor) and display the value computed by the shared engine.

interface FormulaRow {
  id: string;
  r: number;
}
interface FormulaContext {
  cells: FCell[][];
  values: Value[][];
  setCells: FormulaGridProps['setCells'];
}

const formulaColumns: ColDef<FormulaRow>[] = [
  {
    headerName: '',
    colId: '#',
    width: 52,
    pinned: 'left',
    valueGetter: (p) => (p.data ? p.data.r + 1 : ''),
    cellClass: 'fx-rownum',
    suppressNavigable: true,
  },
  ...FORMULA_COLS.map((name, c): ColDef<FormulaRow> => ({
    headerName: name,
    colId: name,
    width: [190, 300, 180, 140, 120, 120][c],
    editable: (p) => !!p.data && !!(p.context as FormulaContext).cells[p.data.r][c].key,
    valueGetter: (p) => (p.data ? (p.context as FormulaContext).cells[p.data.r][c].raw : null),
    valueFormatter: (p) => {
      if (!p.data) return '';
      const ctx = p.context as FormulaContext;
      return formatValue(ctx.values[p.data.r][c], ctx.cells[p.data.r][c].fmt);
    },
    valueSetter: (p) => {
      const ctx = p.context as FormulaContext;
      const key = p.data && ctx.cells[p.data.r][c].key;
      if (key) ctx.setCells([{ key, raw: p.newValue === null || p.newValue === undefined ? '' : String(p.newValue) }]);
      return false; // cells are rebuilt from the new edits
    },
    cellClass: (p) => {
      if (!p.data) return '';
      const ctx = p.context as FormulaContext;
      const v = ctx.values[p.data.r][c];
      return [`fx-${ctx.cells[p.data.r][c].style}`, typeof v === 'number' ? 'fx-num' : '', isError(v) ? 'fx-error' : ''].join(' ');
    },
    tooltipValueGetter: (p) => {
      const cell = p.data && (p.context as FormulaContext).cells[p.data.r][c];
      return cell && (isFormula(cell.raw) || cell.style === 'code') ? String(cell.raw) : undefined;
    },
  })),
];

function FormulaGrid({ cells, values, setCells, onSelect }: FormulaGridProps) {
  const rowData = useMemo(() => cells.map((_, r) => ({ id: String(r), r })), [cells]);
  const context = useMemo<FormulaContext>(() => ({ cells, values, setCells }), [cells, values, setCells]);
  return (
    <div className="ag-host ag-formulas">
      <AgGridReact<FormulaRow>
        theme={theme}
        rowData={rowData}
        columnDefs={formulaColumns}
        defaultColDef={{ sortable: false, resizable: true, suppressMovable: true }}
        getRowId={(p) => p.data.id}
        context={context}
        rowHeight={36}
        stopEditingWhenCellsLoseFocus
        tooltipShowDelay={400}
        onCellFocused={(e) => {
          const c = FORMULA_COLS.indexOf(typeof e.column === 'object' && e.column ? e.column.getColId() : '');
          if (e.rowIndex !== null && e.rowIndex !== undefined && c >= 0) onSelect(e.rowIndex, c);
        }}
      />
    </div>
  );
}

export default function AgGridSheet() {
  return (
    <SalesWorkspace
      library="AG Grid"
      renderGrid={(props) => <Grid {...props} />}
      renderFormulas={(props) => <FormulaGrid {...props} />}
    />
  );
}
