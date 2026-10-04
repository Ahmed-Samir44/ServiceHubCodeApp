import { getContext } from '@microsoft/power-apps/app';
import { NAV_GROUPS } from '../app/navigation';
import { MicrosoftDataverseService } from '../generated';
import { DATA_ORG_URL } from './config';
import { listRows } from './dataverse';

/**
 * The signed-in user's table privileges in the data org, used to show/hide what the model-driven
 * app would hide: tables without Read, and New / Delete / Save / Activate without Create / Delete /
 * Write. Collected from the user's security roles, directly assigned and through team membership.
 *
 * This only drives the UI. Dataverse still enforces every privilege on every call, so if the check
 * cannot run (e.g. outside the Power Apps host, or the user can't read role data) everything is
 * shown and Dataverse's own "access denied" message is surfaced instead.
 */

export type PrivilegeAction = 'create' | 'read' | 'write' | 'delete' | 'assign' | 'share';

export interface UserPrivileges {
  /** False when privileges could not be read — then every check returns true. */
  known: boolean;
  can: (tableLogicalName: string, action: PrivilegeAction) => boolean;
}

const ACTIONS: Record<PrivilegeAction, string> = { create: 'Create', read: 'Read', write: 'Write', delete: 'Delete', assign: 'Assign', share: 'Share' };
const CONTEXT_TIMEOUT_MS = 4000;

export const ALLOW_ALL: UserPrivileges = { known: false, can: () => true };

const privilegeName = (tableLogicalName: string, action: PrivilegeAction) => `prv${ACTIONS[action]}${tableLogicalName}`.toLowerCase();

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** FetchXML: privileges (from our list) granted through roles linked to the user by `userLink`. */
function privilegesFetch(names: string[], userLink: string): string {
  const values = names.map((name) => `<value>${escapeXml(name)}</value>`).join('');
  // roleprivileges hang off the root role; the role a user actually holds is its business-unit copy,
  // which points back to the root through parentrootroleid.
  return `<fetch distinct="true"><entity name="privilege"><attribute name="name" /><filter><condition attribute="name" operator="in">${values}</condition></filter><link-entity name="roleprivileges" from="privilegeid" to="privilegeid" intersect="true"><link-entity name="role" from="parentrootroleid" to="roleid">${userLink}</link-entity></link-entity></entity></fetch>`;
}

async function currentUserId(): Promise<string | null> {
  const context = await Promise.race([
    getContext(),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), CONTEXT_TIMEOUT_MS)),
  ]);
  const objectId = context?.user.objectId;
  if (!objectId) return null;
  const { rows } = await listRows({ entitySet: 'systemusers', select: 'systemuserid', filter: `azureactivedirectoryobjectid eq ${objectId}`, top: 1 });
  const id = rows[0]?.systemuserid;
  return typeof id === 'string' ? id : null;
}

let previewPrivileges: UserPrivileges | null = null;

/** Dev preview only: pretend the signed-in user has these privileges. */
export function setPreviewPrivileges(privileges: UserPrivileges): void {
  previewPrivileges = privileges;
}

/** Raw call to the data org (functions answer with an object, not a `value` list). */
async function callDataOrg(path: string): Promise<Record<string, unknown> | null> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(DATA_ORG_URL, path);
  if (result.error || !result.data || typeof result.data !== 'object') return null;
  return result.data as Record<string, unknown>;
}

/**
 * The user's own privileges through RetrieveUserPrivileges, as the model-driven app does. Any user
 * may ask this about themselves, so it doesn't need read access to security roles (which the
 * role-based read below does). Null when the function can't be called here.
 */
async function privilegesFromFunction(): Promise<Set<string> | null> {
  try {
    const me = await callDataOrg('WhoAmI');
    const userId = typeof me?.UserId === 'string' ? me.UserId : await currentUserId();
    if (!userId) return null;
    const answer = await callDataOrg(`systemusers(${userId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`);
    const list = answer?.RolePrivileges;
    if (!Array.isArray(list) || !list.length) return null;
    return new Set(list.map((item) => String((item as { PrivilegeName?: unknown }).PrivilegeName ?? '').toLowerCase()).filter(Boolean));
  } catch {
    return null;
  }
}

export async function loadUserPrivileges(): Promise<UserPrivileges> {
  if (previewPrivileges) return previewPrivileges;
  const fromFunction = await privilegesFromFunction();
  if (fromFunction) {
    return { known: true, can: (table, action) => fromFunction.has(privilegeName(table, action)) };
  }
  try {
    const userId = await currentUserId();
    if (!userId) {
      return ALLOW_ALL;
    }
    const tables = NAV_GROUPS.flatMap((group) => group.items).flatMap((item) => (item.kind === 'table' ? [item.table.logicalName] : []));
    const names = tables.flatMap((table) => (Object.keys(ACTIONS) as PrivilegeAction[]).map((action) => privilegeName(table, action)));
    const user = escapeXml(userId);
    const [direct, viaTeams] = await Promise.all([
      listRows({
        entitySet: 'privileges',
        fetchXml: privilegesFetch(names, `<link-entity name="systemuserroles" from="roleid" to="roleid" intersect="true"><filter><condition attribute="systemuserid" operator="eq" value="${user}" /></filter></link-entity>`),
      }),
      listRows({
        entitySet: 'privileges',
        fetchXml: privilegesFetch(names, `<link-entity name="teamroles" from="roleid" to="roleid" intersect="true"><link-entity name="teammembership" from="teamid" to="teamid" intersect="true"><filter><condition attribute="systemuserid" operator="eq" value="${user}" /></filter></link-entity></link-entity>`),
      }),
    ]);
    const granted = new Set([...direct.rows, ...viaTeams.rows].map((row) => String(row.name ?? '').toLowerCase()));
    return { known: true, can: (table, action) => granted.has(privilegeName(table, action)) };
  } catch {
    return ALLOW_ALL;
  }
}
