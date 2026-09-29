import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, formatted, loadRegionBUs, lookupId, num, text, type BusinessUnit } from './common';
import { loadSpecialties, regionSpecialties } from './specialties';

/**
 * Region-filtered link/document tables: Events, Installments, Special Handling, System Links and
 * Other Health Info (a name + a URL each), plus CPGs & Protocols and CAPEX.
 */

export type DocumentKind = 'events' | 'installments' | 'special-handling' | 'system-links' | 'other-health-info';

const DOCUMENT_TABLES: Record<DocumentKind, { entity: string; set: string; url: string }> = {
  events: { entity: 'cr18c_servhubevent', set: 'cr18c_servhubevents', url: 'cr18c_iframeurl' },
  installments: { entity: 'cr18c_servhubinstallment', set: 'cr18c_servhubinstallments', url: 'cr18c_iframeurl' },
  'special-handling': { entity: 'cr18c_servhubspecialhandling', set: 'cr18c_servhubspecialhandlings', url: 'cr18c_iframeurl' },
  'system-links': { entity: 'cr18c_servhubsystemlink', set: 'cr18c_servhubsystemlinks', url: 'cr18c_systemlink' },
  'other-health-info': { entity: 'cr18c_otherhealthinfo', set: 'cr18c_otherhealthinfos', url: 'cr18c_iframeurl' },
};

export interface HubDocument {
  id: string;
  name: string;
  url: string;
}

const regionCondition = (region: Region) => `<condition attribute="cr18c_region" operator="eq" value="${REGION_CHOICE_VALUE[region]}" />`;

export function loadDocuments(kind: DocumentKind, region: Region): Promise<HubDocument[]> {
  return cached(`docs:${kind}:${region}`, async () => {
    const table = DOCUMENT_TABLES[kind];
    const rows = await fetchAllRows(table.set, activeRowsFetch(table.entity, [`${table.entity}id`, 'cr18c_name', table.url], regionCondition(region)));
    return rows
      .map((row) => ({ id: text(row, `${table.entity}id`), name: text(row, 'cr18c_name'), url: text(row, table.url) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export interface Guideline extends HubDocument {
  specialtyId: string;
  specialtyName: string;
}

export interface GuidelinesData {
  guidelines: Guideline[];
  specialties: { id: string; name: string }[];
}

/** CPGs & Protocols of the region (legacy renderCPGs). */
export function loadGuidelines(region: Region): Promise<GuidelinesData> {
  return cached(`cpgs:${region}`, async () => {
    const [specialties, rows] = await Promise.all([
      loadSpecialties(),
      fetchAllRows('cr18c_servhubcpgprotocols', activeRowsFetch('cr18c_servhubcpgprotocol', ['cr18c_servhubcpgprotocolid', 'cr18c_name', 'cr18c_iframeurl', 'cr18c_specialty'], regionCondition(region))),
    ]);
    const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
    return {
      guidelines: rows
        .map((row) => ({
          id: text(row, 'cr18c_servhubcpgprotocolid'),
          name: text(row, 'cr18c_name'),
          url: text(row, 'cr18c_iframeurl'),
          specialtyId: lookupId(row, 'cr18c_specialty'),
          specialtyName: specialtyName.get(lookupId(row, 'cr18c_specialty')) ?? formatted(row, 'cr18c_specialty'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      specialties: regionSpecialties(specialties, region).map(({ id, name }) => ({ id, name })),
    };
  });
}

export const DEVICE_STATUS: Record<number, { label: string; badge: string }> = {
  0: { label: 'On Hold', badge: 'sbadge-amber' },
  1: { label: 'Working', badge: 'sbadge-green' },
  2: { label: 'Out Of Service', badge: 'sbadge-red' },
};

export interface CapexItem extends Guideline {
  status: number | null;
  imageUrl: string;
  descriptionEn: string;
  descriptionAr: string;
  buId: string;
  buName: string;
}

export interface CapexData {
  items: CapexItem[];
  bus: BusinessUnit[];
  specialties: { id: string; name: string }[];
}

/** CAPEX devices of the region: Egypt shows device cards, KSA a list of documents (legacy). */
export function loadCapex(region: Region): Promise<CapexData> {
  return cached(`capex:${region}`, async () => {
    const [bus, specialties, rows] = await Promise.all([
      loadRegionBUs(region),
      loadSpecialties(),
      fetchAllRows(
        'cr18c_servhubcapexes',
        activeRowsFetch(
          'cr18c_servhubcapex',
          ['cr18c_servhubcapexid', 'cr18c_name', 'cr18c_devicestatus', 'cr18c_image', 'cr18c_descriptionen', 'cr18c_descriptionar', 'cr18c_iframeurl', 'cr18c_bun', 'cr18c_specialty'],
          regionCondition(region),
        ),
      ),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
    return {
      items: rows
        .map((row) => ({
          id: text(row, 'cr18c_servhubcapexid'),
          name: text(row, 'cr18c_name'),
          url: text(row, 'cr18c_iframeurl'),
          status: num(row, 'cr18c_devicestatus'),
          imageUrl: text(row, 'cr18c_image'),
          descriptionEn: text(row, 'cr18c_descriptionen'),
          descriptionAr: text(row, 'cr18c_descriptionar'),
          buId: lookupId(row, 'cr18c_bun'),
          buName: buName.get(lookupId(row, 'cr18c_bun')) ?? formatted(row, 'cr18c_bun'),
          specialtyId: lookupId(row, 'cr18c_specialty'),
          specialtyName: specialtyName.get(lookupId(row, 'cr18c_specialty')) ?? formatted(row, 'cr18c_specialty'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bus,
      specialties: regionSpecialties(specialties, region).map(({ id, name }) => ({ id, name })),
    };
  });
}

const OFFICE_FILE = /\.(xlsx|xlsm|xlsb|xls|docx|docm|doc|pptx|pptm|ppt)$/i;

/**
 * URL to show a document inside the page. SharePoint refuses to be framed by the code app's host,
 * except through its Office Online "embed" views, so Office files on SharePoint are turned into
 * `WopiFrame.aspx?sourcedoc=…&action=embedview` (and Doc.aspx / sharing links get action=embedview).
 * Other URLs are returned unchanged. Whether it loads still depends on the tenant's settings, so the
 * viewer always offers "Open in new tab".
 */
export function embedUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!/(^|\.)sharepoint\.com$/i.test(url.hostname)) return raw;
  // Office Online page (Doc.aspx / WopiFrame.aspx / xlviewer) or a sharing link: ask for the embed view.
  if (/\/_layouts\/15\/(doc|doc2|wopiframe|wopiframe2|xlviewer)\.aspx$/i.test(url.pathname) || /^\/:[a-z]:\//i.test(url.pathname)) {
    url.searchParams.set('action', 'embedview');
    return url.toString();
  }
  // Direct link to an Office file: open it through Office Online in embed mode.
  const path = decodeURIComponent(url.pathname);
  if (OFFICE_FILE.test(path)) {
    const site = /^\/(?:sites|teams)\/[^/]+/i.exec(path)?.[0] ?? '';
    return `${url.origin}${site}/_layouts/15/WopiFrame.aspx?sourcedoc=${encodeURIComponent(path)}&action=embedview`;
  }
  return raw;
}

/** Whether to try showing a document inside the page (always, since SharePoint embed views are tried). */
export function canEmbed(url: string): boolean {
  return /^https:\/\//i.test(url.trim());
}

/** Opens a document in a new tab. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
