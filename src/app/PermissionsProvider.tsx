import { useMemo, type ReactNode } from 'react';
import { ALLOW_ALL, loadUserPrivileges } from '../data/permissions';
import { useAsyncData } from '../data/useAsyncData';
import { PermissionsContext } from './permissionsContext';

/** Reads the signed-in user's table privileges once when the app opens. */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const result = useAsyncData('privileges', loadUserPrivileges);
  const value = useMemo(
    () => ({ ready: !result.loading, privileges: result.data ?? ALLOW_ALL }),
    [result.loading, result.data],
  );
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
