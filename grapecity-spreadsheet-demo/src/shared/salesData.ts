/** Sample data and the tree model shared by both grid routes. */

export const CATEGORIES = ['Computers', 'Accessories', 'Audio'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ['In stock', 'Low stock', 'Out of stock'] as const;
export type Status = (typeof STATUSES)[number];

/** Categorical palette slots in fixed order (validated default palette). */
export const CATEGORY_COLOR: Record<Category, string> = {
  Computers: '#2a78d6',
  Accessories: '#eb6834',
  Audio: '#1baf7a',
};

export interface Product {
  id: string;
  name: string;
  category: Category;
  units: number;
  price: number;
  status: Status;
}

let nextId = 1;
export const newId = () => `p${nextId++}`;

export const SAMPLE: Product[] = (
  [
    ['Laptop Pro 14', 'Computers', 12, 1299, 'In stock'],
    ['Desktop Tower', 'Computers', 5, 999, 'Low stock'],
    ['Tablet 11"', 'Computers', 9, 599, 'In stock'],
    ['27" Monitor', 'Accessories', 24, 329, 'In stock'],
    ['Mech Keyboard', 'Accessories', 40, 119, 'In stock'],
    ['Wireless Mouse', 'Accessories', 85, 49, 'In stock'],
    ['Webcam 4K', 'Accessories', 22, 149, 'In stock'],
    ['Docking Station', 'Accessories', 15, 219, 'Out of stock'],
    ['ANC Headset', 'Audio', 18, 249, 'Low stock'],
    ['USB Speaker', 'Audio', 30, 79, 'Out of stock'],
  ] as const
).map(([name, category, units, price, status]) => ({ id: newId(), name, category, units, price, status }));

/** One displayed row: a category node, a product leaf, or the grand total. */
export type TreeRow =
  | {
      kind: 'category';
      id: string;
      name: Category;
      category: Category;
      units: number;
      total: number;
      childCount: number;
      expanded: boolean;
      statusCounts: Record<Status, number>;
    }
  | ({ kind: 'product'; total: number } & Product)
  | { kind: 'total'; id: 'total'; name: 'Total'; units: number; total: number };

export const SORTS = [
  { value: 'name-asc', label: 'Name A → Z' },
  { value: 'name-desc', label: 'Name Z → A' },
  { value: 'total-desc', label: 'Total: high → low' },
  { value: 'total-asc', label: 'Total: low → high' },
  { value: 'units-desc', label: 'Units: high → low' },
] as const;
export type SortKey = (typeof SORTS)[number]['value'];

const totalOf = (p: Product) => p.units * p.price;

function compare(sort: SortKey) {
  const [key, dir] = sort.split('-') as ['name' | 'total' | 'units', 'asc' | 'desc'];
  const sign = dir === 'asc' ? 1 : -1;
  return (a: { name: string; units: number; total: number }, b: typeof a) =>
    sign * (key === 'name' ? a.name.localeCompare(b.name) : a[key] - b[key]);
}

export interface TreeNode {
  category: Category;
  products: (Product & { total: number })[];
  units: number;
  total: number;
}

/** Group products into category nodes, filtered by search and sorted. */
export function buildTree(products: Product[], search: string, sort: SortKey): TreeNode[] {
  const q = search.trim().toLowerCase();
  const nodes = CATEGORIES.map((category) => {
    const items = products
      .filter((p) => p.category === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || category.toLowerCase().includes(q))
      .map((p) => ({ ...p, total: totalOf(p) }))
      .sort(compare(sort));
    return {
      category,
      products: items,
      units: items.reduce((s, p) => s + p.units, 0),
      total: items.reduce((s, p) => s + p.total, 0),
    };
  });
  return nodes.filter((n) => n.products.length || !q).sort((a, b) => compare(sort)({ ...a, name: a.category }, { ...b, name: b.category }));
}

/** Flatten the tree into display rows, honoring expanded categories. */
export function flatten(tree: TreeNode[], expanded: Set<Category>, forceOpen: boolean): TreeRow[] {
  const rows: TreeRow[] = [];
  for (const n of tree) {
    const open = forceOpen || expanded.has(n.category);
    const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, n.products.filter((p) => p.status === s).length])) as Record<Status, number>;
    rows.push({ kind: 'category', id: `cat:${n.category}`, name: n.category, category: n.category, units: n.units, total: n.total, childCount: n.products.length, expanded: open, statusCounts });
    if (open) rows.push(...n.products.map((p) => ({ kind: 'product' as const, ...p })));
  }
  return rows;
}

export function grandTotal(tree: TreeNode[]): TreeRow {
  return { kind: 'total', id: 'total', name: 'Total', units: tree.reduce((s, n) => s + n.units, 0), total: tree.reduce((s, n) => s + n.total, 0) };
}

export const money = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const int = (v: number) => v.toLocaleString('en-US');
