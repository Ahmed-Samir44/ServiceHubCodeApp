import { createContext, useContext } from 'react';
import { ALLOW_ALL, type UserPrivileges } from '../data/permissions';

export interface PermissionsState {
  /** False while the user's privileges are still being read. */
  ready: boolean;
  privileges: UserPrivileges;
}

export const PermissionsContext = createContext<PermissionsState>({ ready: true, privileges: ALLOW_ALL });

export const usePermissions = () => useContext(PermissionsContext);
