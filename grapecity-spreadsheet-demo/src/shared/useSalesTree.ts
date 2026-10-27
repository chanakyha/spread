import { useCallback, useMemo, useState } from 'react';
import { CATEGORIES, SAMPLE, buildTree, flatten, grandTotal, newId, type Category, type Product, type SortKey } from './salesData';

interface History {
  past: Product[][];
  present: Product[];
  future: Product[][];
}

/**
 * All grid state for one route: products (with undo/redo), the expanded tree
 * nodes, search and sort. Both grids render `rows` and call these actions,
 * so the libraries only differ in how they draw cells.
 */
export function useSalesTree() {
  const [history, setHistory] = useState<History>({ past: [], present: SAMPLE, future: [] });
  const [expanded, setExpanded] = useState<Set<Category>>(() => new Set(CATEGORIES));
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name-asc');

  const products = history.present;

  /** Every data change goes through here so it can be undone. */
  const commit = useCallback((recipe: (prev: Product[]) => Product[]) => {
    setHistory((h) => {
      const next = recipe(h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-100), present: next, future: [] };
    });
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Product>) =>
      commit((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target || Object.entries(patch).every(([k, v]) => target[k as keyof Product] === v)) return prev;
        return prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      }),
    [commit],
  );

  /** Apply several edits as one undo step (e.g. a paste into many cells). */
  const updateMany = useCallback(
    (patches: { id: string; patch: Partial<Product> }[]) =>
      commit((prev) => {
        if (!patches.length) return prev;
        const byId = new Map(patches.map((x) => [x.id, x.patch]));
        return prev.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id) } : p));
      }),
    [commit],
  );

  const remove = useCallback((id: string) => commit((prev) => prev.filter((p) => p.id !== id)), [commit]);

  const add = useCallback(
    (category: Category) => {
      const product: Product = { id: newId(), name: 'New product', category, units: 1, price: 0, status: 'In stock' };
      commit((prev) => [...prev, product]);
      setExpanded((e) => new Set(e).add(category));
      return product;
    },
    [commit],
  );

  const duplicate = useCallback(
    (id: string) =>
      commit((prev) => {
        const i = prev.findIndex((p) => p.id === id);
        if (i < 0) return prev;
        const copy = { ...prev[i], id: newId(), name: `${prev[i].name} (copy)` };
        return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
      }),
    [commit],
  );

  const undo = useCallback(
    () => setHistory((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h)),
    [],
  );
  const redo = useCallback(
    () => setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h)),
    [],
  );

  const toggle = useCallback(
    (c: Category) =>
      setExpanded((e) => {
        const next = new Set(e);
        if (next.has(c)) next.delete(c);
        else next.add(c);
        return next;
      }),
    [],
  );
  const expandAll = useCallback(() => setExpanded(new Set(CATEGORIES)), []);
  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const tree = useMemo(() => buildTree(products, search, sort), [products, search, sort]);
  // While searching, matches are shown inside their (forced open) category.
  const rows = useMemo(() => flatten(tree, expanded, !!search.trim()), [tree, expanded, search]);
  const total = useMemo(() => grandTotal(tree), [tree]);

  return {
    products,
    tree,
    rows,
    total,
    search,
    sort,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    actions: { update, updateMany, remove, add, duplicate, undo, redo, toggle, expandAll, collapseAll, setSearch, setSort },
  };
}

export type SalesModel = ReturnType<typeof useSalesTree>;
export type SalesActions = SalesModel['actions'];
