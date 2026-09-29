import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './dataverse';

export interface AsyncData<T> {
  loading: boolean;
  data: T | undefined;
  error: string | undefined;
}

/**
 * Loads data whenever `key` changes (null = don't load). Results are stored with the key they
 * belong to, so "loading" is derived during render instead of reset with setState in an effect,
 * and a slow earlier response can never overwrite a newer one.
 */
export function useAsyncData<T>(key: string | null, loader: () => Promise<T>): AsyncData<T> {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ key, error: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result && result.key === key ? result : null;
  return { loading: key !== null && current === null, data: current?.data, error: current?.error };
}
