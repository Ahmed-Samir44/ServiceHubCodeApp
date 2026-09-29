import { useEffect, useState } from 'react';
import { getContext } from '@microsoft/power-apps/app';

export interface CurrentUser {
  fullName: string;
  userPrincipalName: string;
}

// Outside the Power Apps host (plain `vite` preview) getContext never resolves, so give up after this.
const CONTEXT_TIMEOUT_MS = 4000;

const timeout = (ms: number) =>
  new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('Power Apps context timed out')), ms);
  });

/** Signed-in user from the Power Apps host, or null until (or unless) it is available. */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.race([getContext(), timeout(CONTEXT_TIMEOUT_MS)])
      .then((context) => {
        if (cancelled) return;
        setUser({
          fullName: context.user.fullName ?? '',
          userPrincipalName: context.user.userPrincipalName ?? '',
        });
      })
      .catch(() => {
        // Not running inside Power Apps — the header falls back to a neutral label.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
