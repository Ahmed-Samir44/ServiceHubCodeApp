import type { TableRef } from '../app/navigation';
import { createRow, deleteRow, listRows, runAction, updateRow } from './dataverse';

/** A user or team that records can be assigned or shared to. */
export interface Principal {
  id: string;
  name: string;
  kind: 'systemuser' | 'team';
}

/** Active users and teams whose name contains the text (like the model-driven Assign/Share pickers). */
export async function searchPrincipals(text: string): Promise<Principal[]> {
  const escaped = text.replace(/'/g, "''");
  const contains = (attribute: string) => (text.trim() ? ` and contains(${attribute},'${escaped}')` : '');
  const [users, teams] = await Promise.all([
    listRows({ entitySet: 'systemusers', select: 'systemuserid,fullname', filter: `isdisabled eq false and accessmode ne 3${contains('fullname')}`, orderBy: 'fullname asc', top: 10 }),
    listRows({ entitySet: 'teams', select: 'teamid,name', filter: `teamtype eq 0${contains('name')}`, orderBy: 'name asc', top: 5 }),
  ]);
  return [
    ...users.rows.map((row) => ({ id: String(row.systemuserid), name: String(row.fullname ?? ''), kind: 'systemuser' as const })),
    ...teams.rows.map((row) => ({ id: String(row.teamid), name: String(row.name ?? ''), kind: 'team' as const })),
  ].filter((principal) => principal.id && principal.name);
}

const principalSet = (principal: Principal) => (principal.kind === 'team' ? 'teams' : 'systemusers');

/** Assign: change the record's owner (needs the Assign privilege). */
export function assignRecord(table: TableRef, id: string, owner: Principal): Promise<void> {
  return updateRow(table.entitySet, id, { 'ownerid@odata.bind': `/${principalSet(owner)}(${owner.id})` });
}

export type AccessRight = 'ReadAccess' | 'WriteAccess' | 'DeleteAccess' | 'AppendAccess' | 'AppendToAccess' | 'AssignAccess' | 'ShareAccess';

/** Share: grant a user/team access to one record (GrantAccess action; needs the Share privilege). */
export async function shareRecord(table: TableRef, id: string, principal: Principal, rights: readonly AccessRight[]): Promise<void> {
  await runAction('GrantAccess', {
    Target: { [`${table.logicalName}id`]: id, '@odata.type': `Microsoft.Dynamics.CRM.${table.logicalName}` },
    PrincipalAccess: {
      Principal: { [`${principal.kind}id`]: principal.id, '@odata.type': `Microsoft.Dynamics.CRM.${principal.kind}` },
      AccessMask: rights.join(', '),
    },
  });
}

// ---- Personal views ("My Views") ----

export interface PersonalViewInput {
  name: string;
  fetchXml: string;
  layoutXml: string;
}

/** Save as new view: creates a personal view (userquery) owned by the user. Returns its id when known. */
export async function createPersonalView(table: TableRef, view: PersonalViewInput): Promise<string | null> {
  const created = await createRow('userqueries', {
    name: view.name,
    returnedtypecode: table.logicalName,
    querytype: 0,
    fetchxml: view.fetchXml,
    layoutxml: view.layoutXml,
  });
  const id = created?.userqueryid;
  return typeof id === 'string' ? id : null;
}

export const updatePersonalView = (id: string, view: PersonalViewInput) =>
  updateRow('userqueries', id, { name: view.name, fetchxml: view.fetchXml, layoutxml: view.layoutXml });

export const deletePersonalView = (id: string) => deleteRow('userqueries', id);
