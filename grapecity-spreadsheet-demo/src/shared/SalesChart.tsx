/** Live chart of the grid's data, drawn with AG Charts Community (MIT). */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Card, Flex, Segmented, Select, Statistic } from 'antd';
import { AreaChartOutlined, BarChartOutlined, DotChartOutlined, LineChartOutlined, PieChartOutlined } from '@ant-design/icons';
import { AgCharts } from 'ag-charts-react';
import {
  AllCommunityModule, ModuleRegistry,
  type AgCartesianChartOptions, type AgCartesianSeriesOptions, type AgChartInstance, type AgChartOptions, type AgPolarChartOptions,
} from 'ag-charts-community';
import { CATEGORY_COLOR, int, money, type TreeNode } from './salesData';

ModuleRegistry.registerModules([AllCommunityModule]);

export const CHART_TYPES = ['column', 'bar', 'line', 'area', 'pie', 'donut'] as const;
export type ChartType = (typeof CHART_TYPES)[number];
const SOURCES = [
  { value: 'total', label: 'Total by product' },
  { value: 'units', label: 'Units by product' },
  { value: 'category', label: 'Revenue by category' },
] as const;
type Source = (typeof SOURCES)[number]['value'];

const SERIES = '#2a78d6'; // categorical slot 1
const INK = { primary: '#0b0b0b', secondary: '#52514e', muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7' };
const FONT = 'Inter, system-ui, sans-serif';
const compact = (v: number, isMoney: boolean) => (isMoney ? '$' : '') + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);

export interface SalesChartHandle {
  /** PNG data URL of the current chart, for exports. */
  image: () => Promise<string | null>;
}

const ICON: Record<ChartType, JSX.Element> = {
  column: <BarChartOutlined />,
  bar: <BarChartOutlined rotate={90} />,
  line: <LineChartOutlined />,
  area: <AreaChartOutlined />,
  pie: <PieChartOutlined />,
  donut: <DotChartOutlined />,
};

export const SalesChart = forwardRef<SalesChartHandle, { tree: TreeNode[] }>(function SalesChart({ tree }, ref) {
  const [type, setType] = useState<ChartType>('column');
  const [source, setSource] = useState<Source>('total');
  const chart = useRef<AgChartInstance>(null);
  const partToWhole = type === 'pie' || type === 'donut';
  // Pie/donut compare a few parts of a whole: only the 3 categories qualify.
  const effectiveSource: Source = partToWhole ? 'category' : source;
  const isMoney = effectiveSource !== 'units';

  useImperativeHandle(ref, () => ({
    image: async () => (chart.current ? chart.current.getImageDataURL({ width: 960, height: 420 }) : null),
  }));

  const data = useMemo(
    () =>
      effectiveSource === 'category'
        ? tree.map((n) => ({ label: n.category, value: n.total }))
        : tree.flatMap((n) => n.products.map((p) => ({ label: p.name, value: effectiveSource === 'units' ? p.units : p.total }))),
    [tree, effectiveSource],
  );

  const options = useMemo<AgChartOptions>(() => {
    const title = SOURCES.find((s) => s.value === effectiveSource)!.label;
    const fmt = (v: number) => (isMoney ? money(v) : int(v));
    const base = {
      data,
      background: { fill: '#ffffff' },
      title: { text: title, fontFamily: FONT, fontSize: 14, fontWeight: 600 as const, color: INK.primary, textAlign: 'left' as const },
      padding: { top: 12, right: 16, bottom: 8, left: 8 },
    };
    if (partToWhole) {
      const slice = {
        angleKey: 'value',
        legendItemKey: 'label',
        calloutLabelKey: 'label',
        calloutLabel: { fontFamily: FONT, color: INK.secondary },
        sectorLabelKey: 'value',
        sectorLabel: { fontFamily: FONT, color: '#ffffff', formatter: ({ value }: { value: unknown }) => compact(Number(value), true) },
        fills: data.map((d) => CATEGORY_COLOR[d.label as keyof typeof CATEGORY_COLOR]),
        strokes: ['#ffffff'],
        strokeWidth: 2, // surface gap between slices
        tooltip: { renderer: ({ datum }: { datum: { label: string; value: number } }) => ({ heading: datum.label, data: [{ label: title, value: fmt(datum.value) }] }) },
      };
      const polar: AgPolarChartOptions = {
        ...base,
        series: [type === 'donut' ? { type: 'donut', innerRadiusRatio: 0.6, ...slice } : { type: 'pie', ...slice }],
        legend: { enabled: true, position: 'bottom', item: { label: { fontFamily: FONT, color: INK.secondary } } },
      };
      return polar;
    }
    const tooltip = { renderer: ({ datum }: { datum: { label: string; value: number } }) => ({ heading: datum.label, data: [{ label: title, value: fmt(datum.value) }] }) };
    const marker = { enabled: true, size: 8, fill: SERIES, stroke: '#ffffff', strokeWidth: 2 };
    const keys = { xKey: 'label', yKey: 'value', yName: title };
    const series: AgCartesianSeriesOptions =
      type === 'line'
        ? { type: 'line', ...keys, stroke: SERIES, strokeWidth: 2, marker, tooltip }
        : type === 'area'
          ? { type: 'area', ...keys, fill: SERIES, fillOpacity: 0.1, stroke: SERIES, strokeWidth: 2, marker, tooltip }
          : { type: 'bar', direction: type === 'bar' ? 'horizontal' : 'vertical', ...keys, fill: SERIES, cornerRadius: 4, tooltip };
    const label = { fontFamily: FONT, fontSize: 11, color: INK.muted };
    const cartesian: AgCartesianChartOptions = {
      ...base,
      series: [series],
      // A single series needs no legend: the title names it.
      legend: { enabled: false },
      axes: {
        x: { type: 'category', position: type === 'bar' ? 'left' : 'bottom', label, line: { stroke: INK.axis }, gridLine: { enabled: false } },
        y: {
          type: 'number',
          position: type === 'bar' ? 'bottom' : 'left',
          label: { ...label, formatter: ({ value }: { value: unknown }) => compact(Number(value), isMoney) },
          gridLine: { style: [{ stroke: INK.grid }] },
          line: { enabled: false },
        },
      },
    };
    return cartesian;
  }, [data, type, partToWhole, effectiveSource, isMoney]);

  const revenue = tree.reduce((s, n) => s + n.total, 0);
  const units = tree.reduce((s, n) => s + n.units, 0);
  const count = tree.reduce((s, n) => s + n.products.length, 0);
  const out = tree.reduce((s, n) => s + n.products.filter((p) => p.status === 'Out of stock').length, 0);

  return (
    <Card
      title="Charts"
      className="chart-card"
      extra={
        <Flex gap={8} wrap>
          <Segmented<ChartType>
            value={type}
            onChange={setType}
            options={CHART_TYPES.map((t) => ({ value: t, icon: ICON[t], label: t[0].toUpperCase() + t.slice(1) }))}
          />
          <Select<Source>
            value={effectiveSource}
            onChange={setSource}
            disabled={partToWhole}
            style={{ width: 190 }}
            options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
            aria-label="Chart data"
          />
        </Flex>
      }
    >
      <Flex gap={32} wrap className="kpis">
        <Statistic title="Revenue" value={revenue} precision={2} prefix="$" />
        <Statistic title="Units sold" value={units} />
        <Statistic title="Products" value={count} />
        <Statistic title="Out of stock" value={out} />
      </Flex>
      <div className="chart-box">
        <AgCharts ref={chart} options={options} style={{ height: '100%' }} />
      </div>
    </Card>
  );
});
