import { getClient } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';

/**
 * Reads files from SharePoint through the app's SharePoint connection, using the connector action
 * "Send an HTTP request to SharePoint" (HttpRequest) → SharePoint REST:
 *   - by file id (Office Online links: Doc.aspx?sourcedoc={GUID}) → _api/web/GetFileById('…')/$value
 *   - by path (direct file links)                              → _api/web/GetFileByServerRelativePath(decodedurl='…')/$value
 * SharePoint refuses to be framed by the code-app host, so the app fetches the file itself and shows
 * it in the page (Excel as tables, PDF in a frame). Every open reads the latest version.
 *
 * The SDK keeps ONE data-sources description (the generated one; first registered wins), so the
 * action is added to that same object at load time, under the SharePoint data source ('allcpgs'),
 * which power.config.json maps to the SharePoint connection. Generated files are not edited.
 */
const DATA_SOURCE = 'allcpgs';

const httpRequest = {
  path: '/{connectionId}/datasets/{dataset}/httprequest',
  method: 'POST',
  parameters: [
    { name: 'connectionId', in: 'path', required: true, type: 'string' },
    { name: 'dataset', in: 'path', required: true, type: 'string' },
    { name: 'parameters', in: 'body', required: true, type: 'object' },
  ],
  responseInfo: { 200: { type: 'object' }, default: { type: 'void' } },
};
(dataSourcesInfo[DATA_SOURCE].apis as Record<string, unknown>).HttpRequest = httpRequest;

const client = getClient(dataSourcesInfo);

export interface SharePointFileRef {
  /** Site URL, e.g. https://tenant.sharepoint.com/sites/Apps */
  site: string;
  /** SharePoint file id (GUID, without braces), when the link carries one. */
  id?: string;
  /** Server-relative path, e.g. /sites/Apps/Shared Documents/Plan.xlsx. */
  serverPath?: string;
  /** The link as stored (SharePoint resolves it like the browser does, incl. moved files). */
  url: string;
  name: string;
  extension: string;
}

const extensionOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

/**
 * The site plus file id or path of a SharePoint file link. Handles:
 *   - direct file URLs  …/sites/X/Shared Documents/a.xlsx
 *   - Office Online links (optionally behind /:x:/r/) …/sites/X/_layouts/15/Doc.aspx?sourcedoc={GUID}&file=a.xlsx
 *   - Doc.aspx / WopiFrame.aspx with a path in sourcedoc
 * Returns null for anonymous sharing links (/:x:/s/…, /:x:/g/…) that identify no file.
 */
export function sharePointFile(raw: string): SharePointFileRef | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)sharepoint\.com$/i.test(url.hostname)) return null;
  let pathname = decodeURIComponent(url.pathname);
  // "/:x:/r/sites/…" is a redirect wrapper around a normal URL; other /:x:/ forms are share tokens.
  const wrapper = /^\/:[a-z]:\/([a-z])(\/.*)$/i.exec(pathname);
  if (wrapper) {
    if (wrapper[1].toLowerCase() !== 'r') return null;
    pathname = wrapper[2];
  }
  const siteMatch = /^(\/(?:sites|teams)\/[^/]+)/i.exec(pathname);
  const site = `${url.origin}${siteMatch ? siteMatch[1] : ''}`;

  if (/\/_layouts\/15\//i.test(pathname)) {
    const sourcedoc = url.searchParams.get('sourcedoc') ?? '';
    const guid = /^\{?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}?$/i.exec(sourcedoc)?.[1];
    if (guid) {
      const name = url.searchParams.get('file') ?? '';
      return { site, id: guid, name, extension: extensionOf(name), url: raw.trim() };
    }
    if (sourcedoc.startsWith('/')) {
      const name = sourcedoc.split('/').pop() ?? '';
      return { site, serverPath: sourcedoc, name, extension: extensionOf(name), url: raw.trim() };
    }
    return null;
  }
  const name = pathname.split('/').pop() ?? '';
  if (!extensionOf(name)) return null;
  // Direct links often carry the file id as d=w<32 hex> (still valid after the file is moved).
  const hex = /^w?([0-9a-f]{32})$/i.exec(url.searchParams.get('d') ?? '')?.[1];
  const id = hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : undefined;
  return { site, id, serverPath: pathname, name, extension: extensionOf(name), url: raw.trim() };
}

const base64ToBytes = (text: string) => {
  const binary = atob(text.replace(/^data:[^,]*,/, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** The connector can return the file as base64 text, a {$content} object, or raw bytes. */
function toBlob(data: unknown, mime: string): Blob {
  if (data instanceof Blob) return data;
  if (data instanceof ArrayBuffer) return new Blob([data], { type: mime });
  if (ArrayBuffer.isView(data)) return new Blob([data as Uint8Array<ArrayBuffer>], { type: mime });
  if (typeof data === 'string') return new Blob([base64ToBytes(data)], { type: mime });
  if (data && typeof data === 'object') {
    const content = (data as Record<string, unknown>).$content ?? (data as Record<string, unknown>).body;
    if (typeof content === 'string') return new Blob([base64ToBytes(content)], { type: mime });
  }
  throw new Error('The file came back in an unexpected format.');
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const quote = (value: string) => value.replace(/'/g, "''");

/** REST calls to try, most reliable first: by id, by the full link (SharePoint resolves moves), by path. */
function candidateUris(file: SharePointFileRef): string[] {
  const uris: string[] = [];
  if (file.id) uris.push(`_api/web/GetFileById('${file.id}')/$value`);
  uris.push(`_api/web/GetFileByUrl(@u)/$value?@u='${encodeURIComponent(quote(file.url))}'`);
  if (file.serverPath) uris.push(`_api/web/GetFileByServerRelativePath(decodedurl=@p)/$value?@p='${encodeURIComponent(quote(file.serverPath))}'`);
  return uris;
}

async function httpGet(site: string, uri: string) {
  const result = await client.executeAsync<Record<string, unknown>, unknown>({
    connectorOperation: {
      tableName: DATA_SOURCE,
      operationName: 'HttpRequest',
      parameters: { dataset: site, parameters: { method: 'GET', uri, headers: {} } },
    },
  });
  if (import.meta.env.DEV) {
    const data = result.data as unknown;
    console.info('[sharepoint]', uri, { success: result.success, type: typeof data, keys: data && typeof data === 'object' ? Object.keys(data as object).slice(0, 5) : undefined, error: result.error?.message });
  }
  return result;
}

/** Downloads a SharePoint file's current content (always the latest version). */
export async function readSharePointFile(file: SharePointFileRef): Promise<Blob> {
  let lastError = 'Couldn’t read the file from SharePoint.';
  for (const uri of candidateUris(file)) {
    const result = await httpGet(file.site, uri);
    if (result.success) return toBlob(result.data, MIME[file.extension] ?? 'application/octet-stream');
    lastError = result.error?.message ?? lastError;
  }
  throw new Error(lastError);
}

/** Encrypted / sensitivity-labelled Office files are wrapped in an OLE container (D0 CF 11 E0). */
export async function isProtectedOfficeFile(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;
}

/** base64url of the link, for the SharePoint "shares" API (u!…). */
const shareToken = (url: string) =>
  'u!' + btoa(unescape(encodeURIComponent(url))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');

/**
 * A PDF rendering of the file made by SharePoint (?format=pdf). Works for files the app can't read
 * itself (encrypted / labelled), because SharePoint renders them with the user's own rights.
 */
export async function readSharePointFileAsPdf(file: SharePointFileRef): Promise<Blob> {
  const uris = [
    ...(file.id ? [`_api/v2.0/sites/root/drive/items/${file.id}/content?format=pdf`] : []),
    `_api/v2.0/shares/${shareToken(file.url)}/driveItem/content?format=pdf`,
  ];
  let lastError = 'SharePoint couldn’t convert the file to PDF.';
  for (const uri of uris) {
    const result = await httpGet(file.site, uri);
    if (result.success) return toBlob(result.data, 'application/pdf');
    lastError = result.error?.message ?? lastError;
  }
  throw new Error(lastError);
}

/** File types the app can show itself; others keep the embed attempt + "Open in new tab". */
const VIEWABLE = new Set(['xlsx', 'xlsm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp']);

/** The SharePoint file behind a link when the app can display it itself, else null. */
export function viewableSharePointFile(url: string): SharePointFileRef | null {
  const file = sharePointFile(url);
  return file && VIEWABLE.has(file.extension) ? file : null;
}
