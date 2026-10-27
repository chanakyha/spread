/**
 * Everything around the grids, shared by both routes: sheet tabs (Sales,
 * Formulas), the Ant Design toolbar, the formula bar, the chart panel and the
 * product drawer. Each route only supplies its two grids.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { App, Button, Card, Dropdown, Flex, Input, Popconfirm, Select, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import {
  DownOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined, FunctionOutlined, NodeCollapseOutlined,
  NodeExpandOutlined, PlusOutlined, RedoOutlined, ReloadOutlined, SearchOutlined, SortAscendingOutlined, TableOutlined, UndoOutlined,
} from '@ant-design/icons';
import { CATEGORIES, SORTS, buildTree, type Category } from './salesData';
import { useSalesTree, type SalesModel } from './useSalesTree';
import { buildFormulaSheet, cellAddress, evaluateSheet, type FCell, type Overrides, type Value } from './formulaSheet';
import { CategoryDot, ProductDrawer } from './cells';
import { SalesChart, type SalesChartHandle } from './SalesChart';
import { exportCsv, exportPdf, exportXlsx } from './exporters';

export interface GridProps {
  model: SalesModel;
  /** Opens the product drawer (the "View" row action). */
  openProduct: (id: string) => void;
}

export interface FormulaGridProps {
  cells: FCell[][];
  /** Evaluated values (same engine react-spreadsheet uses). */
  values: Value[][];
  /** Store an edit for an editable cell. */
  setCells: (edits: { key: string; raw: string }[]) => void;
  /** Report the active cell so the formula bar can show it. */
  onSelect: (row: number, col: number) => void;
}

type SheetKey = 'sales' | 'formulas';

export function SalesWorkspace({
  library, renderGrid, renderFormulas,
}: { library: string; renderGrid: (props: GridProps) => ReactNode; renderFormulas: (props: FormulaGridProps) => ReactNode }) {
  const model = useSalesTree();
  const { actions, search, sort, canUndo, canRedo } = model;
  const { message } = App.useApp();
  const chart = useRef<SalesChartHandle>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [sheet, setSheet] = useState<SheetKey>('sales');

  // ---- Formulas sheet ---------------------------------------------------------
  const [overrides, setOverrides] = useState<Overrides>({});
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  // The data block mirrors the Sales sheet (all products, current sort order).
  const fullTree = useMemo(() => buildTree(model.products, '', sort), [model.products, sort]);
  const ordered = useMemo(() => fullTree.flatMap((n) => n.products), [fullTree]);
  const cells = useMemo(() => buildFormulaSheet(ordered, overrides), [ordered, overrides]);
  const values = useMemo(() => evaluateSheet(cells), [cells]);
  const setCells = (edits: { key: string; raw: string }[]) =>
    edits.length && setOverrides((o) => ({ ...o, ...Object.fromEntries(edits.map((e) => [e.key, e.raw])) }));

  const activeCell = active ? cells[active.row]?.[active.col] : undefined;
  const [barText, setBarText] = useState('');
  useEffect(() => setBarText(activeCell?.raw === null || activeCell?.raw === undefined ? '' : String(activeCell.raw)), [activeCell]);
  const commitBar = () => activeCell?.key && setCells([{ key: activeCell.key, raw: barText }]);

  // ---- export ------------------------------------------------------------------
  const onExport = async (kind: 'xlsx' | 'csv' | 'pdf') => {
    setExporting(true);
    try {
      // Exports include every product (ignoring search / collapsed nodes) in the current sort order.
      if (kind === 'csv') exportCsv(fullTree);
      else {
        const png = (await chart.current?.image()) ?? null;
        const formulas = { cells, values };
        if (kind === 'xlsx') await exportXlsx(fullTree, png, formulas);
        else await exportPdf(fullTree, png, `Sales — ${library}`, formulas);
      }
      message.success(`Downloaded sales.${kind}`);
    } catch (e) {
      message.error(`Export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const addTo = (category: Category) => {
    const p = actions.add(category);
    message.info(`Added "${p.name}" to ${category} — double-click a cell to edit it`);
  };

  const exportMenu = (
    <Dropdown
      menu={{
        items: [
          { key: 'xlsx', icon: <FileExcelOutlined />, label: 'Excel (.xlsx) — both sheets, formulas, chart' },
          { key: 'csv', icon: <FileTextOutlined />, label: 'CSV — Sales rows' },
          { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF — tables and chart' },
        ],
        onClick: ({ key }) => onExport(key as 'xlsx' | 'csv' | 'pdf'),
      }}
    >
      <Button type="primary" icon={<DownloadOutlined />} loading={exporting}>
        Export <DownOutlined />
      </Button>
    </Dropdown>
  );

  const salesToolbar = (
    <Flex className="toolbar" gap={8} wrap align="center">
      <Space.Compact>
        <Tooltip title="Undo">
          <Button icon={<UndoOutlined />} onClick={actions.undo} disabled={!canUndo} aria-label="Undo" />
        </Tooltip>
        <Tooltip title="Redo">
          <Button icon={<RedoOutlined />} onClick={actions.redo} disabled={!canRedo} aria-label="Redo" />
        </Tooltip>
      </Space.Compact>
      <Dropdown
        menu={{
          items: CATEGORIES.map((c) => ({ key: c, label: <Space size={8}><CategoryDot category={c} />{c}</Space> })),
          onClick: ({ key }) => addTo(key as Category),
        }}
      >
        <Button icon={<PlusOutlined />}>
          Add product <DownOutlined />
        </Button>
      </Dropdown>
      <Space.Compact>
        <Tooltip title="Expand all">
          <Button icon={<NodeExpandOutlined />} onClick={actions.expandAll} aria-label="Expand all" />
        </Tooltip>
        <Tooltip title="Collapse all">
          <Button icon={<NodeCollapseOutlined />} onClick={actions.collapseAll} aria-label="Collapse all" />
        </Tooltip>
      </Space.Compact>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search products"
        value={search}
        onChange={(e) => actions.setSearch(e.target.value)}
        style={{ width: 220 }}
        aria-label="Search products"
      />
      <Select value={sort} onChange={actions.setSort} options={[...SORTS]} prefix={<SortAscendingOutlined />} style={{ width: 210 }} aria-label="Sort" />
      <div style={{ flex: 1 }} />
      {exportMenu}
    </Flex>
  );

  const formulaToolbar = (
    <Flex className="toolbar" gap={8} align="center">
      <Tag className="name-box" variant="filled">{active ? cellAddress(active.row, active.col) : '—'}</Tag>
      <Input
        className="formula-input"
        prefix={<FunctionOutlined />}
        value={barText}
        onChange={(e) => setBarText(e.target.value)}
        onPressEnter={commitBar}
        onBlur={commitBar}
        disabled={!activeCell?.key}
        placeholder={active ? (activeCell?.key ? 'Type a value or =FORMULA, then Enter' : 'This cell is read-only (Sales data, labels)') : 'Select a cell'}
        aria-label="Formula bar"
      />
      <Popconfirm title="Reset all edits on this sheet?" okText="Reset" onConfirm={() => setOverrides({})} disabled={!Object.keys(overrides).length}>
        <Button icon={<ReloadOutlined />} disabled={!Object.keys(overrides).length}>Reset</Button>
      </Popconfirm>
      {exportMenu}
    </Flex>
  );

  return (
    <Flex vertical gap={20}>
      <Card className="sheet-card" styles={{ body: { padding: 0 } }}>
        {sheet === 'sales' ? salesToolbar : formulaToolbar}
        <div className="sheet-grid">
          {sheet === 'sales'
            ? renderGrid({ model, openProduct: setViewing })
            : renderFormulas({ cells, values, setCells, onSelect: (row, col) => setActive({ row, col }) })}
        </div>
        <Flex className="sheet-tabs" align="center" gap={12}>
          <Tabs
            size="small"
            type="card"
            tabPlacement="bottom"
            activeKey={sheet}
            onChange={(k) => setSheet(k as SheetKey)}
            items={[
              { key: 'sales', label: 'Sales', icon: <TableOutlined /> },
              { key: 'formulas', label: 'Formulas', icon: <FunctionOutlined /> },
            ]}
          />
          <Typography.Text type="secondary" className="sheet-hint">
            {sheet === 'sales' ? 'Category → product tree. Double-click to edit.' : 'Live copy of Sales + spreadsheet functions. Yellow cells are editable.'}
          </Typography.Text>
        </Flex>
      </Card>

      <SalesChart ref={chart} tree={model.tree} />

      <ProductDrawer
        product={model.products.find((p) => p.id === viewing) ?? null}
        tree={model.tree}
        onClose={() => setViewing(null)}
        onDuplicate={actions.duplicate}
        onDelete={actions.remove}
      />
    </Flex>
  );
}
