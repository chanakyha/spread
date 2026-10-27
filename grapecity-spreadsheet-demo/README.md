# Sales grid demo: react-spreadsheet and AG Grid, with Ant Design

The same sales sheet built twice, once per grid library, on two routes:

| Route | Grid | License |
| --- | --- | --- |
| `/` | [react-spreadsheet](https://github.com/iddan/react-spreadsheet) | MIT |
| `/ag-grid` | AG Grid **Community** | MIT |

All UI controls are [Ant Design](https://ant.design) (MIT). Charts use AG Charts Community (MIT). Exports use exceljs and jsPDF (MIT).

```bash
npm install
npm run dev
```

## Features (identical on both routes)

- **Tree view in the grid.** Category nodes (Computers, Accessories, Audio) expand and collapse to show their products. Category rows show unit and revenue totals and a status summary. There's also Expand all / Collapse all.
- **Editing.** Double-click Product name, Units or Price to edit. Change Status with the in-cell Ant Design select.
- **Row actions.**
  - Product rows: **View** (a drawer with details and revenue share), **Duplicate**, and **Delete** (with confirm).
  - Category rows: **Add** a product.
- **Toolbar.** Undo/redo, Add product (choose a category), search, and sort (by name, total or units, applied inside each category).
- **Export.**
  - **Excel:** category rows hold `SUM` formulas, products sit in collapsible outline groups, there's a flat *Data* sheet, and the chart is included as an image.
  - **CSV:** flat rows.
  - **PDF:** the tree table plus the chart.
- **Charts.** Column, bar, line, area, pie and donut charts for Total by product, Units by product or Revenue by category, plus KPI tiles. They update live with the grid and follow the search filter.

## Second sheet: Formulas

Switch sheets with the tabs under the grid. The **Formulas** sheet has three parts:

1. **A live copy of the Sales products** (rows 2–11). It's read-only and updates whenever you edit the Sales sheet. Total is `=C2*D2`.
2. **Function examples** showing the formula and its result:
   - Totals and stats: SUM, AVERAGE, MEDIAN, MIN, MAX, LARGE, COUNT, COUNTA
   - Conditional: SUMIF, COUNTIF, SUMIFS, AVERAGEIF, IF
   - Lookup and text: INDEX/MATCH, ROUND, CONCATENATE, UPPER
   - A percentage
3. **Your formulas**: yellow cells for your own values and formulas. Two rows come pre-filled, *Tax rate* and *Units goal*, and other cells reference them. The result cells in the examples are editable too.

There's a **formula bar** (cell address plus contents) for viewing and editing the selected cell. **Reset** clears your edits. The Excel export includes this sheet with real formulas, and the PDF adds it as a page.

Formula engine:
- react-spreadsheet uses its built-in engine, fast-formula-parser.
- AG Grid Community has no formula engine, so the same parser is used there, and for exports.
- fast-formula-parser 1.0.19 lacks some common functions (MIN, MAX, COUNTA, UPPER, MATCH, MEDIAN, LARGE, SMALL, RANK, TEXTJOIN, the `…IFS` family). Its SUMIF/COUNTIF/AVERAGEIF also fail inside react-spreadsheet. `src/shared/extraFunctions.ts` provides these, so both routes support the same functions.

## How each grid does it

- **react-spreadsheet.** Every cell carries its own `DataViewer`, so the tree toggle, status select and action buttons render inside cells. Product totals (`=B2*C2`), expanded category sums (`=SUM(...)`) and the grand total are real spreadsheet formulas. Keystrokes during an edit are buffered, so each edit is one undo step.
- **AG Grid Community.** The same Ant Design components are cell renderers. Tree data, Excel export and integrated charts are **Enterprise** (paid) features in AG Grid, so the tree is drawn by our own cell renderer and the exports and charts come from the libraries above. The grand total is a pinned bottom row.

## Files

| Path | Purpose |
| --- | --- |
| `src/components/ReactSpreadsheetSheet.tsx` | react-spreadsheet grid |
| `src/components/AgGridSheet.tsx` | AG Grid grid |
| `src/shared/SalesWorkspace.tsx` | Toolbar, export menu, chart panel, drawer |
| `src/shared/useSalesTree.ts` | Data state: tree, undo/redo, search, sort |
| `src/shared/cells.tsx` | Ant Design cell components (tree label, status, actions, drawer) |
| `src/shared/SalesChart.tsx` | AG Charts panel |
| `src/shared/exporters.ts` | Excel / CSV / PDF export |
| `src/shared/formulaSheet.ts` | Formulas sheet layout + evaluation |
| `src/shared/extraFunctions.ts` | Spreadsheet functions missing from the parser |
