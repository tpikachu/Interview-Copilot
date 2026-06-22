import { useMemo, useState } from 'react';

/** Client-side search + pagination over an already date-sorted list.
 *  `searchText` maps an item to the text its query matches against. */
export function usePagedSearch<T>(items: T[], searchText: (item: T) => string, pageSize = 8) {
  const [query, setQueryRaw] = useState('');
  const [page, setPage] = useState(0);
  const setQuery = (q: string) => {
    setQueryRaw(q);
    setPage(0);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => searchText(i).toLowerCase().includes(q));
    // searchText is a pure field mapper; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return { query, setQuery, page: safePage, setPage, totalPages, pageItems, total: filtered.length };
}
