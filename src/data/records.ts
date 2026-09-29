import { listRows, type DataverseRow } from './dataverse';

/** One record with all its columns (and formatted-value / lookup annotations). */
export async function getRecord(entitySet: string, logicalName: string, id: string): Promise<DataverseRow> {
  const { rows } = await listRows({ entitySet, filter: `${logicalName}id eq ${id}`, top: 1 });
  const record = rows[0];
  if (!record) throw new Error('This record no longer exists or you do not have access to it.');
  return record;
}
