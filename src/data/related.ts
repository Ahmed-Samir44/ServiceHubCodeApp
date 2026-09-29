import { findTable, type TableRef } from '../app/navigation';
import { columnMeta, tableAttributes } from './columnMeta';
import { listRows, type ListResult } from './dataverse';
import type { FormSubgrid } from './forms';
import { lookupTableInfo, lookupTargetTable } from './lookups';
import { loadViewById, loadViews, pageFetchXml, pickView, withCondition, type TableView } from './views';

/**
 * Data for a form subgrid: the related table's records whose lookup points back to the record
 * being viewed, shown through the subgrid's own view (or the related table's default view).
 */

export interface SubgridData {
  table: TableRef;
  label: string;
  view: TableView;
  result: ListResult;
}

const SUBGRID_ROWS = 10;
// Audit/ownership lookups never carry a parent-child relationship shown in a subgrid.
const SYSTEM_LOOKUPS = new Set(['ownerid', 'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby', 'owningbusinessunit', 'owningteam', 'owninguser']);
const backReferenceCache = new Map<string, Promise<string | null>>();

/**
 * The lookup on the related table that points to `parentTable`. The saved schemas don't list lookup
 * targets, so candidates are checked against real data; names that appear in the relationship name
 * (e.g. cr301_doctorname in "cr301_newdoctordataset_cr301_table1_doctorname") are tried first.
 */
function findBackReference(related: TableRef, parentTable: string, relationship: string | null): Promise<string | null> {
  const key = `${related.logicalName}>${parentTable}>${relationship ?? ''}`;
  let cached = backReferenceCache.get(key);
  if (!cached) {
    cached = (async () => {
      const relationshipName = (relationship ?? '').toLowerCase();
      const lookups = tableAttributes(related.logicalName)
        .filter((name) => {
          const meta = columnMeta(related.logicalName, name);
          return meta?.kind === 'lookup' && meta.navigationProperty && !SYSTEM_LOOKUPS.has(name);
        })
        .sort((a, b) => Number(relationshipName.includes(b.replace(/^[a-z0-9]+_/, ''))) - Number(relationshipName.includes(a.replace(/^[a-z0-9]+_/, ''))));
      for (const attribute of lookups) {
        const target = await lookupTargetTable(related.entitySet, related.logicalName, attribute);
        if (target === parentTable) return attribute;
      }
      return null;
    })();
    backReferenceCache.set(key, cached);
  }
  return cached;
}

async function relatedTable(logicalName: string): Promise<{ table: TableRef; label: string } | null> {
  const known = findTable(logicalName);
  if (known) return known;
  const info = await lookupTableInfo(logicalName);
  return info ? { table: { logicalName, entitySet: info.entitySet, primaryName: info.primaryName }, label: logicalName } : null;
}

export async function loadSubgrid(subgrid: FormSubgrid, parentTable: string, parentId: string): Promise<SubgridData> {
  const related = await relatedTable(subgrid.targetTable);
  if (!related) throw new Error(`The related table ${subgrid.targetTable} isn't available here.`);
  const [backReference, view] = await Promise.all([
    findBackReference(related.table, parentTable, subgrid.relationship),
    (subgrid.viewId ? loadViewById(related.table, subgrid.viewId).catch(() => null) : Promise.resolve(null)).then(
      async (byId) => byId ?? pickView(await loadViews(related.table), null) ?? null,
    ),
  ]);
  if (!backReference) throw new Error('Related records can’t be matched to this record yet (no linked records found).');
  if (!view) throw new Error(`No view is available for ${related.label}.`);
  const fetchXml = pageFetchXml(withCondition(view.fetchXml, backReference, parentId), 1, SUBGRID_ROWS).fetchXml;
  const result = await listRows({ entitySet: related.table.entitySet, fetchXml });
  return { table: related.table, label: related.label, view, result };
}
