import { Element3, Monitor, type Icon } from 'iconsax-react';

/**
 * Sidebar registry — mirrors the model-driven app's sitemap (areas, order and display names)
 * so users find everything where they already expect it. Display names, entity sets and primary
 * name columns come from Dataverse (reference/dataverse-schemas), not guesses.
 */

export interface TableRef {
  /** Logical name, e.g. `cr301_newdoctordataset`. Primary key is always `${logicalName}id`. */
  logicalName: string;
  /** Web API entity set, e.g. `cr301_newdoctordatasets`. */
  entitySet: string;
  /** Primary name column (the record's title). */
  primaryName: string;
}

export type NavItem =
  | { kind: 'hub'; id: 'service-hub'; label: string; icon: Icon }
  | { kind: 'table'; id: string; label: string; icon: Icon; table: TableRef };

export interface NavGroup {
  id: 'general' | 'quick-links' | 'health-libraries';
  label: string;
  items: NavItem[];
}

const table = (label: string, logicalName: string, entitySet: string, primaryName: string): NavItem => ({
  kind: 'table',
  id: logicalName,
  label,
  icon: Element3,
  table: { logicalName, entitySet, primaryName },
});

export const SERVICE_HUB_ITEM: NavItem = { kind: 'hub', id: 'service-hub', label: 'Andalusia Service Hub', icon: Monitor };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      SERVICE_HUB_ITEM,
      table('New Doctor Datasets', 'cr301_newdoctordataset', 'cr301_newdoctordatasets', 'cr301_title'),
      table('Service Datasets', 'cr301_ksaservicedataset', 'cr301_ksaservicedatasets', 'cr301_title'),
      table('COELists', 'cr301_coelist', 'cr301_coelists', 'cr301_coeclinicname'),
      table('DetailsByBUS', 'cr301_detailsbybu', 'cr301_detailsbybus', 'cr301_newcolumn'),
      table('SpecialtyDetails', 'cr301_specialtydetail', 'cr301_specialtydetails', 'cr301_newcolumn'),
      table('AndalusiaLocations', 'cr301_andalusialocations', 'cr301_andalusialocationses', 'cr301_branchname'),
      table('BankAccounts', 'cr301_bankaccounts', 'cr301_bankaccountses', 'cr301_newcolumn'),
      table('Canvas Page Usage Logs', 'cr301_canvaspageusagelog', 'cr301_canvaspageusagelogs', 'cr301_newcolumn'),
      table('New BU Fees', 'cr301_table1', 'cr301_table1s', 'cr301_title'),
      table('ServHub Specialty Mappings', 'cr18c_servhubspecialtymapping', 'cr18c_servhubspecialtymappings', 'cr18c_name'),
      table('Procedcure Clinics', 'servhub_procedcureclinc', 'servhub_procedcureclincs', 'servhub_clinic'),
      table('New Offer Datasets', 'cr301_newofferdataset', 'cr301_newofferdatasets', 'cr301_title'),
      table('ServHub Programs', 'cr18c_servhubprogram', 'cr18c_servhubprograms', 'cr18c_name'),
      table('ServHub HomeCares', 'cr18c_servhubhomecare', 'cr18c_servhubhomecares', 'cr18c_name'),
      table('Specialty KSA_Service_Hubs', 'cr301_specialtyksa_service_hub', 'cr301_specialtyksa_service_hubs', 'cr301_title'),
      table('Offer Requests', 'new_offer_equest', 'new_offer_equests', 'new_name'),
      table('SubCategories', 'cr301_subcategory', 'cr301_subcategories', 'cr301_newcolumn'),
    ],
  },
  {
    id: 'quick-links',
    label: 'Quick Links',
    items: [
      table('Scripts', 'cr301_scripts', 'cr301_scriptses', 'cr301_newcolumn'),
      table('Service Hub Insurance Companies', 'cr18c_servicehubinsurancecompany', 'cr18c_servicehubinsurancecompanies', 'cr18c_companyname'),
      table('Department Working Hours', 'cr18c_departmentworkinghours', 'cr18c_departmentworkinghourses', 'cr18c_name'),
      table('ServHub Quality Assurance Tips', 'cr18c_servhubqualityassurancetips', 'cr18c_servhubqualityassurancetipses', 'cr18c_tipname'),
      table('ServHub CRM Dictionaries', 'cr18c_servhubcrmdictionary', 'cr18c_servhubcrmdictionaries', 'cr18c_reason'),
      table('ServHub Events', 'cr18c_servhubevent', 'cr18c_servhubevents', 'cr18c_name'),
      table('ServHub Special Handlings', 'cr18c_servhubspecialhandling', 'cr18c_servhubspecialhandlings', 'cr18c_name'),
      table('ServHub Installments', 'cr18c_servhubinstallment', 'cr18c_servhubinstallments', 'cr18c_name'),
      table('ServHub System links', 'cr18c_servhubsystemlink', 'cr18c_servhubsystemlinks', 'cr18c_systemlink'),
      table('ServHub Booking policies', 'cr18c_servhubbookingpolicy', 'cr18c_servhubbookingpolicies', 'cr18c_name'),
    ],
  },
  {
    id: 'health-libraries',
    label: 'Health libraries',
    items: [
      table('ServHub CPG & Protocols', 'cr18c_servhubcpgprotocol', 'cr18c_servhubcpgprotocols', 'cr18c_name'),
      table('ServHub CAPEXES', 'cr18c_servhubcapex', 'cr18c_servhubcapexes', 'cr18c_name'),
      table('Other Health Infos', 'cr18c_otherhealthinfo', 'cr18c_otherhealthinfos', 'cr18c_name'),
    ],
  },
];

const itemById = new Map<string, NavItem>(NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]));

export const DEFAULT_NAV_ITEM_ID = SERVICE_HUB_ITEM.id;

export const getNavItem = (id: string): NavItem => itemById.get(id) ?? SERVICE_HUB_ITEM;

/** Sidebar table for a logical name (e.g. the target of a lookup), if ServiceHub has one. */
export function findTable(logicalName: string): { label: string; table: TableRef } | undefined {
  const item = itemById.get(logicalName);
  return item?.kind === 'table' ? { label: item.label, table: item.table } : undefined;
}
