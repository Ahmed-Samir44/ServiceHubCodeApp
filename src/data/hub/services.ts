import type { Region } from '../../app/region';
import { listRows } from '../dataverse';
import { pageFetchXml } from '../views';
import { activeRowsFetch, cached, fetchAllRows, formatted, idCondition, loadRegionBUs, lookupId, num, searchCondition, text, xmlValue, type BusinessUnit } from './common';
import { equivalentSpecialtyIds, loadSpecialties, loadSpecialtyMappings, regionSpecialties, type Specialty, type SpecialtyMapping } from './specialties';

/**
 * Services and Packages (cr301_ksaservicedataset) — the legacy Services / Packages screens.
 * Packages are the rows in the "Package" service category, services are everything else.
 * Unlike the legacy page (which downloaded every row, up to 100k, before filtering), filters,
 * search and the price sort run in Dataverse and results are read a page at a time.
 */

export type ServiceKind = 'services' | 'packages';
export type PriceSort = 'none' | 'asc' | 'desc';

export interface ServiceCategory {
  id: string;
  name: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  nameAr: string;
  code: string;
  price: number | null;
  specialtyId: string;
  buId: string;
  categoryId: string;
  /** Names Dataverse sends with the row — used when a lookup isn't in the loaded lists (e.g. an inactive specialty). */
  specialtyLabel: string;
  buLabel: string;
  categoryLabel: string;
}

export interface ServiceLookups {
  bus: BusinessUnit[];
  /** Region specialties (filter list). */
  specialties: Specialty[];
  /** Every specialty, to name a row's specialty. */
  allSpecialties: Specialty[];
  mappings: SpecialtyMapping[];
  categories: ServiceCategory[];
  packageCategoryId: string;
}

export interface ServiceQuery {
  kind: ServiceKind;
  region: Region;
  buId: string;
  specialtyId: string;
  categoryId: string;
  search: string;
  sort: PriceSort;
  page: number;
}

export interface ServicePage {
  items: ServiceItem[];
  more: boolean;
  /** Dataverse total (capped at 5000 by the platform); null when not reported. */
  total: number | null;
}

export const SERVICE_PAGE_SIZE = 60;

/** Legacy fallback when no "Package" category is found by name (the live org's id). */
const FALLBACK_PACKAGE_CATEGORY_ID = 'f94932d4-18b3-f011-bbd2-6045bd8ce2d0';
/** Business unit the legacy page always excluded from services and packages. */
const EXCLUDED_BU_ID = '1c7ece99-6cec-ef11-be20-000d3a49954b';

export function loadServiceLookups(region: Region): Promise<ServiceLookups> {
  return cached(`service-lookups:${region}`, async () => {
    const [bus, specialties, mappings, categoryRows] = await Promise.all([
      loadRegionBUs(region),
      loadSpecialties(),
      loadSpecialtyMappings(),
      cached('service-categories', () =>
        fetchAllRows('cr301_servicecategoryksa_service_hubs', activeRowsFetch('cr301_servicecategoryksa_service_hub', ['cr301_servicecategoryksa_service_hubid', 'cr301_title'])),
      ),
    ]);
    const categories = categoryRows
      .map((row) => ({ id: text(row, 'cr301_servicecategoryksa_service_hubid'), name: text(row, 'cr301_title') }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const packageCategoryId = categories.find((category) => category.name.trim().toLowerCase() === 'package')?.id ?? FALLBACK_PACKAGE_CATEGORY_ID;
    return { bus, specialties: regionSpecialties(specialties, region), allSpecialties: specialties, mappings, categories, packageCategoryId };
  });
}

function serviceFetch(query: ServiceQuery, lookups: ServiceLookups): string {
  const specialtyIds = query.specialtyId ? equivalentSpecialtyIds(lookups.mappings, query.specialtyId) : [];
  const category =
    query.kind === 'packages'
      ? `<condition attribute="cr301_servicecategory" operator="eq" value="${xmlValue(lookups.packageCategoryId)}" />`
      : `<condition attribute="cr301_servicecategory" operator="ne" value="${xmlValue(lookups.packageCategoryId)}" />${idCondition('cr301_servicecategory', query.categoryId ? [query.categoryId] : [])}`;
  const order =
    query.sort === 'none'
      ? '<order attribute="cr301_title" /><order attribute="cr301_ksaservicedatasetid" />'
      : `<order attribute="servhub_priced" descending="${query.sort === 'desc'}" /><order attribute="cr301_ksaservicedatasetid" />`;
  const attributes = ['cr301_ksaservicedatasetid', 'cr301_title', 'cr301_servicear', 'cr301_code', 'servhub_priced', 'cr301_specialty', 'cr18c_bu', 'cr301_servicecategory']
    .map((name) => `<attribute name="${name}" />`)
    .join('');
  return `<fetch version="1.0" mapping="logical"><entity name="cr301_ksaservicedataset">${attributes}${order}<filter type="and">
<condition attribute="statecode" operator="eq" value="0" />
<condition attribute="cr18c_bu" operator="ne" value="${EXCLUDED_BU_ID}" />
<condition attribute="cr301_status" operator="eq" value="Active" />
<condition attribute="cr301_is_deleted" operator="ne" value="true" />
${category}${idCondition('cr18c_bu', query.buId ? [query.buId] : [])}${idCondition('cr301_specialty', specialtyIds)}${searchCondition(['cr301_title', 'cr301_servicear', 'cr301_code'], query.search)}
</filter><link-entity name="businessunit" from="businessunitid" to="cr18c_bu" alias="bu"><link-entity name="crd04_regions" from="crd04_regionsid" to="cr603_region" alias="reg"><filter type="and"><condition attribute="crd04_id" operator="eq" value="${query.region}" /></filter></link-entity></link-entity></entity></fetch>`;
}

export async function queryServices(query: ServiceQuery, lookups: ServiceLookups): Promise<ServicePage> {
  const result = await listRows({ entitySet: 'cr301_ksaservicedatasets', fetchXml: pageFetchXml(serviceFetch(query, lookups), query.page, SERVICE_PAGE_SIZE).fetchXml });
  return {
    items: result.rows.map((row) => ({
      id: text(row, 'cr301_ksaservicedatasetid'),
      name: text(row, 'cr301_title'),
      nameAr: text(row, 'cr301_servicear'),
      code: text(row, 'cr301_code'),
      price: num(row, 'servhub_priced'),
      specialtyId: lookupId(row, 'cr301_specialty'),
      buId: lookupId(row, 'cr18c_bu'),
      categoryId: lookupId(row, 'cr301_servicecategory'),
      specialtyLabel: formatted(row, 'cr301_specialty'),
      buLabel: formatted(row, 'cr18c_bu'),
      categoryLabel: formatted(row, 'cr301_servicecategory'),
    })),
    more: result.moreRecords ?? result.rows.length === SERVICE_PAGE_SIZE,
    total: result.totalCount,
  };
}
