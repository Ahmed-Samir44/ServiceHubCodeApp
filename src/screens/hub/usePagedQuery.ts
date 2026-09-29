import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../data/dataverse';

export interface Page<T> {
  items: T[];
  more: boolean;
  total: number | null;
}

interface PagedState<T> {
  key: string;
  items: T[];
  /** Pages loaded so far. */
  pages: number;
  more: boolean;
  total: number | null;
  loadingMore: boolean;
  error?: string;
}

/**
 * Server-paged list: page 1 loads whenever `key` changes (null = don't load), `loadMore` appends
 * the next page. Results are stored with their key, so a stale response never shows.
 */
export function usePagedQuery<T>(key: string | null, loadPage: (page: number) => Promise<Page<T>>) {
  const [state, setState] = useState<PagedState<T> | null>(null);
  const loaderRef = useRef(loadPage);
  useEffect(() => {
    loaderRef.current = loadPage;
  });

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    loaderRef.current(1).then(
      (page) => {
        if (!cancelled) setState({ key, items: page.items, pages: 1, more: page.more, total: page.total, loadingMore: false });
      },
      (error: unknown) => {
        if (!cancelled) setState({ key, items: [], pages: 0, more: false, total: null, loadingMore: false, error: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = state && state.key === key ? state : null;

  const loadMore = useCallback(() => {
    if (!current || current.loadingMore || !current.more) return;
    const { key: requestKey, pages } = current;
    const update = (change: (prev: PagedState<T>) => PagedState<T>) =>
      setState((prev) => (prev && prev.key === requestKey ? change(prev) : prev));
    update((prev) => ({ ...prev, loadingMore: true, error: undefined }));
    loaderRef.current(pages + 1).then(
      (page) => update((prev) => ({ ...prev, items: [...prev.items, ...page.items], pages: pages + 1, more: page.more, total: page.total ?? prev.total, loadingMore: false })),
      (error: unknown) => update((prev) => ({ ...prev, loadingMore: false, error: errorMessage(error) })),
    );
  }, [current]);

  return {
    loading: key !== null && current === null,
    items: current?.items ?? [],
    more: current?.more ?? false,
    total: current?.total ?? null,
    loadingMore: current?.loadingMore ?? false,
    error: current?.error,
    loadMore,
  };
}
