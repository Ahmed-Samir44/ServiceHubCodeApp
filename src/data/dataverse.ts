import { MicrosoftDataverseService } from '../generated';
import { DATA_ORG_URL } from './config';

/** One Dataverse row as returned by the Web API (values plus OData annotations). */
export type DataverseRow = Record<string, unknown>;

export interface ListRequest {
  entitySet: string;
  select?: string;
  filter?: string;
  orderBy?: string;
  top?: number;
  fetchXml?: string;
}

export interface ListResult {
  rows: DataverseRow[];
  /** From `@Microsoft.Dynamics.CRM.morerecords` (FetchXML paging); null when not reported. */
  moreRecords: boolean | null;
  /** From `@Microsoft.Dynamics.CRM.totalrecordcount` (FetchXML `returntotalrecordcount`); capped at 5000 by Dataverse. */
  totalCount: number | null;
}

/** Calls to the data org. Swappable so the dev preview can run without Dataverse. */
export interface DataverseGateway {
  list: (request: ListRequest) => Promise<Record<string, unknown>>;
  /** Returns the created row when the service sends it back (return=representation). */
  create: (entitySet: string, item: DataverseRow) => Promise<DataverseRow | undefined>;
  update: (entitySet: string, id: string, item: DataverseRow) => Promise<void>;
  remove: (entitySet: string, id: string) => Promise<void>;
  /** Unbound Dataverse action, e.g. GrantAccess (Share). */
  action: (name: string, body: DataverseRow) => Promise<DataverseRow>;
}

// Only what the grid uses: formatted values (lookup names, choice labels, dates) and the
// paging/count annotations. "*" also returned lookup navigation metadata on every lookup value.
const PREFER = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.*"';
const ACCEPT = 'application/json';

function unwrap<T>(result: { error?: unknown; data: T }): T {
  if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
  return result.data;
}

const connectorGateway: DataverseGateway = {
  list: async (request) =>
    unwrap(
      await MicrosoftDataverseService.ListRecordsWithOrganization(
        DATA_ORG_URL,
        request.entitySet,
        PREFER,
        undefined,
        undefined,
        undefined,
        request.select,
        request.filter,
        request.orderBy,
        undefined,
        request.fetchXml,
        request.top,
      ),
    ) ?? {},
  create: async (entitySet, item) => {
    const created: unknown = unwrap(await MicrosoftDataverseService.CreateRecordWithOrganization('return=representation', ACCEPT, DATA_ORG_URL, entitySet, item));
    return created && typeof created === 'object' ? (created as DataverseRow) : undefined;
  },
  update: async (entitySet, id, item) => {
    unwrap(await MicrosoftDataverseService.UpdateRecordWithOrganization('return=minimal', ACCEPT, DATA_ORG_URL, entitySet, id, item));
  },
  remove: async (entitySet, id) => {
    unwrap(await MicrosoftDataverseService.DeleteRecordWithOrganization(DATA_ORG_URL, entitySet, id));
  },
  action: async (name, body) => unwrap(await MicrosoftDataverseService.PerformUnboundActionWithOrganization(DATA_ORG_URL, name, body)) ?? {},
};

let gateway: DataverseGateway = connectorGateway;

/** Dev preview only: replace the connector with canned data. */
export function setPreviewGateway(preview: DataverseGateway): void {
  gateway = preview;
}

export async function listRows(request: ListRequest): Promise<ListResult> {
  const started = performance.now();
  const data = await gateway.list(request);
  if (import.meta.env.DEV) {
    // Timing of every data-org call, to see where load time goes (Local Play / npm run dev only).
    const count = Array.isArray(data.value) ? data.value.length : 0;
    console.info(`[dataverse] ${request.entitySet}${request.fetchXml ? ' (view)' : ''}: ${Math.round(performance.now() - started)} ms, ${count} rows`);
  }
  const value = data.value;
  const more = data['@Microsoft.Dynamics.CRM.morerecords'];
  const total = data['@Microsoft.Dynamics.CRM.totalrecordcount'];
  return {
    rows: Array.isArray(value) ? (value as DataverseRow[]) : [],
    moreRecords: typeof more === 'boolean' ? more : null,
    totalCount: typeof total === 'number' && total >= 0 ? total : null,
  };
}

export const createRow = (entitySet: string, item: DataverseRow) => gateway.create(entitySet, item);
export const updateRow = (entitySet: string, id: string, item: DataverseRow) => gateway.update(entitySet, id, item);
export const deleteRow = (entitySet: string, id: string) => gateway.remove(entitySet, id);

export const runAction = (name: string, body: DataverseRow) => gateway.action(name, body);

/** Activate / Deactivate: setting statecode lets Dataverse apply that state's default status reason. */
export const setRowState = (entitySet: string, id: string, active: boolean) =>
  gateway.update(entitySet, id, { statecode: active ? 0 : 1 });

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unexpected error';
}
