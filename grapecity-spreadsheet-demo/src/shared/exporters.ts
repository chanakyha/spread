/**
 * Exports for the sales tree (identical for both grids). exceljs and jsPDF
 * (both MIT) load on demand. Exports contain every product regardless of
 * search or collapsed nodes, in the current sort order.
 */
import { STATUSES, money, type TreeNode } from './salesData';
import { FORMULA_COLS, formatValue, isFormula, type FCell, type Fmt, type Value } from './formulaSheet';

/** The Formulas sheet: raw cells plus their evaluated values. */
export interface FormulaSheetExport {
  cells: FCell[][];
  values: Value[][];
}

const EXCEL_FMT: Record<Fmt, string | undefined> = { money: '$#,##0.00', int: '#,##0', pct: '0.0%', text: undefined };

const MONEY = '$#,##0.00';
const HEAD = ['Item', 'Units', 'Price', 'Total', 'Status'];

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Excel: category rows are summary rows (SUM formulas) above their products,
 * which sit in collapsible outline groups. A flat "Data" sheet is included
 * for filtering/pivoting, and the chart as a picture.
 */
export async function exportXlsx(tree: TreeNode[], chartPng: string | null, formulas?: FormulaSheetExport, fileName = 'sales.xlsx') {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sales', { views: [{ state: 'frozen', ySplit: 1 }], properties: { outlineProperties: { summaryBelow: false, summaryRight: false } } });
  ws.columns = [{ width: 30 }, { width: 10 }, { width: 14 }, { width: 16 }, { width: 14 }];

  const header = ws.addRow(HEAD);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
  });

  const categoryRows: number[] = [];
  for (const node of tree) {
    const catRow = ws.addRow([node.category]);
    categoryRows.push(catRow.number);
    const first = catRow.number + 1;
    for (const p of node.products) {
      const r = ws.addRow([p.name, p.units, p.price, null, p.status]);
      r.outlineLevel = 1;
      r.getCell(1).alignment = { indent: 2 };
      r.getCell(4).value = { formula: `B${r.number}*C${r.number}`, result: p.total };
    }
    const last = first + node.products.length - 1;
    catRow.getCell(2).value = node.products.length ? { formula: `SUM(B${first}:B${last})`, result: node.units } : 0;
    catRow.getCell(4).value = node.products.length ? { formula: `SUM(D${first}:D${last})`, result: node.total } : 0;
    catRow.eachCell({ includeEmpty: true }, (c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    });
  }
  const totalRow = ws.addRow(['Total']);
  const sumOf = (col: string) => categoryRows.map((r) => `${col}${r}`).join('+') || '0';
  totalRow.getCell(2).value = { formula: sumOf('B'), result: tree.reduce((s, n) => s + n.units, 0) };
  totalRow.getCell(4).value = { formula: sumOf('D'), result: tree.reduce((s, n) => s + n.total, 0) };
  totalRow.eachCell({ includeEmpty: true }, (c) => {
    c.font = { bold: true };
    c.border = { top: { style: 'thin', color: { argb: 'FF111827' } } };
  });
  ws.getColumn(3).numFmt = MONEY;
  ws.getColumn(4).numFmt = MONEY;

  if (chartPng) {
    const id = wb.addImage({ base64: chartPng.replace(/^data:image\/png;base64,/, ''), extension: 'png' });
    ws.addImage(id, { tl: { col: 6, row: 1 }, ext: { width: 720, height: 315 } });
  }

  // Flat table: one row per product with its category.
  const data = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  data.columns = [
    { header: 'Category', width: 16 },
    { header: 'Product', width: 28 },
    { header: 'Units', width: 10 },
    { header: 'Price', width: 14, style: { numFmt: MONEY } },
    { header: 'Total', width: 16, style: { numFmt: MONEY } },
    { header: 'Status', width: 14 },
  ];
  data.getRow(1).font = { bold: true };
  tree.forEach((n) =>
    n.products.forEach((p) => {
      const r = data.addRow([n.category, p.name, p.units, p.price, null, p.status]);
      r.getCell(5).value = { formula: `C${r.number}*D${r.number}`, result: p.total };
    }),
  );
  data.autoFilter = { from: 'A1', to: 'F1' };

  // The Formulas sheet with real Excel formulas (and their cached results).
  if (formulas) {
    const fx = wb.addWorksheet('Formulas');
    fx.columns = [28, 44, 20, 18, 16, 16].map((width) => ({ width }));
    formulas.cells.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.raw === null || cell.raw === '') return;
        const target = fx.getCell(r + 1, c + 1);
        const v = formulas.values[r][c];
        target.value = isFormula(cell.raw) ? { formula: cell.raw.slice(1), result: v === null ? undefined : (v as string | number | boolean) } : cell.raw;
        const fmt = cell.fmt && EXCEL_FMT[cell.fmt];
        if (fmt) target.numFmt = fmt;
        if (cell.style === 'header') {
          target.font = { bold: true };
          target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        } else if (cell.style === 'section') target.font = { bold: true, size: 13 };
        else if (cell.style === 'code') target.font = { name: 'Consolas', color: { argb: 'FF4F46E5' } };
        else if (cell.style === 'result') target.font = { bold: true };
        else if (cell.style === 'hint') target.font = { italic: true, color: { argb: 'FF6B7280' } };
        else if (cell.style === 'input') target.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBE6' } };
      }),
    );
  }

  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

export function exportCsv(tree: TreeNode[], fileName = 'sales.csv') {
  const quote = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows: (string | number)[][] = [['Category', 'Product', 'Units', 'Price', 'Total', 'Status']];
  tree.forEach((n) => n.products.forEach((p) => rows.push([n.category, p.name, p.units, p.price.toFixed(2), p.total.toFixed(2), p.status])));
  download(new Blob([rows.map((r) => r.map(quote).join(',')).join('\r\n')], { type: 'text/csv' }), fileName);
}

export async function exportPdf(tree: TreeNode[], chartPng: string | null, title: string, formulas?: FormulaSheetExport, fileName = 'sales.pdf') {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title, 40, 44);

  type Kind = 'category' | 'product' | 'total';
  const kinds: Kind[] = [];
  const body: string[][] = [];
  for (const n of tree) {
    const flagged = STATUSES.filter((s) => s !== 'In stock')
      .map((s) => [s, n.products.filter((p) => p.status === s).length] as const)
      .filter(([, c]) => c);
    body.push([`${n.category}  (${n.products.length})`, String(n.units), '', money(n.total), flagged.map(([s, c]) => `${c} ${s.toLowerCase()}`).join(', ')]);
    kinds.push('category');
    for (const p of n.products) {
      body.push([p.name, String(p.units), money(p.price), money(p.total), p.status]);
      kinds.push('product');
    }
  }
  body.push(['Total', String(tree.reduce((s, n) => s + n.units, 0)), '', money(tree.reduce((s, n) => s + n.total, 0)), '']);
  kinds.push('total');

  autoTable(doc, {
    startY: 60,
    head: [HEAD],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    didParseCell: (cell) => {
      if (cell.section !== 'body') return;
      const kind = kinds[cell.row.index];
      if (kind === 'category') {
        cell.cell.styles.fontStyle = 'bold';
        cell.cell.styles.fillColor = [243, 244, 246];
      } else if (kind === 'total') {
        cell.cell.styles.fontStyle = 'bold';
      } else if (cell.column.index === 0) {
        cell.cell.styles.cellPadding = { top: 6, bottom: 6, right: 6, left: 22 }; // tree indent
      }
    },
  });

  if (chartPng) {
    const pageH = doc.internal.pageSize.getHeight();
    const w = doc.internal.pageSize.getWidth() - 80;
    const h = w * (420 / 960);
    let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 24;
    if (y + h > pageH - 40) {
      doc.addPage();
      y = 40;
    }
    doc.addImage(chartPng, 'PNG', 40, y, w, h, undefined, 'FAST');
  }

  // Formulas sheet: everything below the Sales copy (function examples + your formulas).
  if (formulas) {
    const startRow = formulas.cells.findIndex((row) => row[0].style === 'section');
    const rows = formulas.cells.slice(startRow).map((row, i) => ({
      text: row.map((cell, c) => (cell.style === 'code' || cell.style === 'label' || cell.style === 'header' || cell.style === 'section' || cell.style === 'hint' ? String(cell.raw ?? '') : formatValue(formulas.values[startRow + i][c], cell.fmt))),
      style: row[0].style,
      address: startRow + i + 1,
    }));
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Formulas', 40, 44);
    autoTable(doc, {
      startY: 60,
      head: [['#', ...FORMULA_COLS]],
      body: rows.map((r) => [String(r.address), ...r.text]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4, lineColor: [229, 231, 235] },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      columnStyles: { 0: { textColor: [156, 163, 175], cellWidth: 28 }, 2: { font: 'courier', textColor: [79, 70, 229] } },
      didParseCell: (cell) => {
        if (cell.section !== 'body') return;
        const style = rows[cell.row.index].style;
        if (style === 'section' || style === 'header') cell.cell.styles.fontStyle = 'bold';
        if (style === 'header') cell.cell.styles.fillColor = [243, 244, 246];
      },
    });
  }
  download(doc.output('blob'), fileName);
}
