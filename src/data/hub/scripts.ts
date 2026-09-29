import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, loadRegionBUs, lookupId, num, text } from './common';

/** Scripts & Knowledge: categories → sub-categories → scripts (legacy navigateToScripts). */

export interface ScriptCategory {
  id: string;
  name: string;
}

export interface ScriptSubCategory extends ScriptCategory {
  categoryId: string;
}

export interface Script {
  id: string;
  name: string;
  tag: string;
  notes: string;
  script: string;
  order: number | null;
  categoryId: string;
  subCategoryId: string;
  buId: string;
  buName: string;
}

export interface ScriptsData {
  categories: ScriptCategory[];
  subCategories: ScriptSubCategory[];
  scripts: Script[];
  bus: { id: string; name: string }[];
}

/** Region value null means "both regions" for categories and sub-categories (legacy). */
const inRegion = (value: number | null, region: Region) => value === null || value === REGION_CHOICE_VALUE[region];

export function loadScripts(region: Region): Promise<ScriptsData> {
  return cached(`scripts:${region}`, async () => {
    const [bus, categoryRows, subRows, scriptRows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('cr301_categories', activeRowsFetch('cr301_category', ['cr301_categoryid', 'cr18c_region', 'cr301_title'])),
      fetchAllRows('cr301_subcategories', activeRowsFetch('cr301_subcategory', ['cr301_subcategoryid', 'cr301_newcolumn', 'cr18c_region', 'cr301_category'])),
      fetchAllRows(
        'cr301_scriptses',
        activeRowsFetch(
          'cr301_scripts',
          ['cr301_scriptsid', 'cr301_newcolumn', 'cr301_tag', 'cr18c_bun', 'cr301_notes', 'cr301_script', 'cr301_order', 'cr301_category', 'cr301_subcategory'],
          `<condition attribute="cr18c_regionchoice" operator="eq" value="${REGION_CHOICE_VALUE[region]}" />`,
        ),
      ),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const scripts = scriptRows
      .map((row) => ({
        id: text(row, 'cr301_scriptsid'),
        name: text(row, 'cr301_newcolumn'),
        tag: text(row, 'cr301_tag'),
        notes: text(row, 'cr301_notes'),
        script: text(row, 'cr301_script'),
        order: num(row, 'cr301_order'),
        categoryId: lookupId(row, 'cr301_category'),
        subCategoryId: lookupId(row, 'cr301_subcategory'),
        buId: lookupId(row, 'cr18c_bun'),
        buName: buName.get(lookupId(row, 'cr18c_bun')) ?? '',
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return {
      categories: categoryRows
        .filter((row) => inRegion(num(row, 'cr18c_region'), region))
        .map((row) => ({ id: text(row, 'cr301_categoryid'), name: text(row, 'cr301_title') })),
      subCategories: subRows
        .filter((row) => inRegion(num(row, 'cr18c_region'), region))
        .map((row) => ({ id: text(row, 'cr301_subcategoryid'), name: text(row, 'cr301_newcolumn'), categoryId: lookupId(row, 'cr301_category') })),
      scripts,
      bus: bus.filter((bu) => scripts.some((script) => script.buId === bu.id)),
    };
  });
}
