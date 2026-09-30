import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, formatted, loadRegionBUs, lookupId, num, text, type BusinessUnit } from './common';
import { loadSpecialties, regionSpecialties } from './specialties';

/** Programs (cr18c_servhubprogram) and Home Care (cr18c_servhubhomecare). */

export const PROGRAM_LEVELS: Record<number, string> = { 0: 'Premium', 1: 'Gold', 2: 'Standard', 3: 'Basic' };

export interface Program {
  id: string;
  name: string;
  programName: string;
  description: string;
  servicesIncluded: string;
  servicesCount: string;
  level: number | null;
  priceBefore: string;
  priceAfter: string;
  buId: string;
  buName: string;
  specialtyId: string;
  specialtyName: string;
}

export interface ProgramsData {
  programs: Program[];
  bus: BusinessUnit[];
  specialties: { id: string; name: string }[];
}

/** Programs of the region (legacy renderPrograms). Services Included is now actually loaded. */
export function loadPrograms(region: Region): Promise<ProgramsData> {
  return cached(`programs:${region}`, async () => {
    const [bus, specialties, rows] = await Promise.all([
      loadRegionBUs(region),
      loadSpecialties(),
      fetchAllRows(
        'cr18c_servhubprograms',
        activeRowsFetch(
          'cr18c_servhubprogram',
          ['cr18c_servhubprogramid', 'cr18c_name', 'cr18c_programname', 'cr18c_programdescription', 'cr18c_servicesincluded', 'cr18c_region', 'cr18c_programlevel', 'cr18c_pricebefore', 'cr18c_priceafter', 'cr18c_noofservices', 'cr18c_specialty', 'cr18c_bun'],
          `<condition attribute="cr18c_region" operator="eq" value="${REGION_CHOICE_VALUE[region]}" />`,
        ),
      ),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
    return {
      programs: rows
        .map((row) => ({
          id: text(row, 'cr18c_servhubprogramid'),
          name: text(row, 'cr18c_name'),
          programName: text(row, 'cr18c_programname'),
          description: text(row, 'cr18c_programdescription'),
          servicesIncluded: text(row, 'cr18c_servicesincluded'),
          servicesCount: text(row, 'cr18c_noofservices'),
          level: num(row, 'cr18c_programlevel'),
          priceBefore: text(row, 'cr18c_pricebefore'),
          priceAfter: text(row, 'cr18c_priceafter'),
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

export interface HomeCareRecord {
  id: string;
  name: string;
  /** Knowledge-base document link(s), opened in the pop-up window. */
  documentUrl: string;
  script: string;
  buId: string;
  buName: string;
  categoryId: string;
  categoryName: string;
  subCategoryId: string;
  subCategoryName: string;
}

/** Home Care records of the region's business units (legacy loadSHCRecords + renderSHCBUs). */
export function loadHomeCare(region: Region): Promise<HomeCareRecord[]> {
  return cached(`home-care:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('cr18c_servhubhomecares', activeRowsFetch('cr18c_servhubhomecare', ['cr18c_servhubhomecareid', 'cr18c_name', 'cr18c_iframeurl', 'cr18c_script', 'cr18c_bu', 'cr18c_category', 'cr18c_subcategory'])),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    return rows
      .filter((row) => buName.has(lookupId(row, 'cr18c_bu')))
      .map((row) => ({
        id: text(row, 'cr18c_servhubhomecareid'),
        name: text(row, 'cr18c_name'),
        documentUrl: text(row, 'cr18c_iframeurl'),
        script: text(row, 'cr18c_script'),
        buId: lookupId(row, 'cr18c_bu'),
        buName: buName.get(lookupId(row, 'cr18c_bu')) ?? '',
        categoryId: lookupId(row, 'cr18c_category'),
        categoryName: formatted(row, 'cr18c_category'),
        subCategoryId: lookupId(row, 'cr18c_subcategory'),
        subCategoryName: formatted(row, 'cr18c_subcategory'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}
