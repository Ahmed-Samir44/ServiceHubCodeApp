import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import type { DataverseRow } from '../dataverse';
import { activeRowsFetch, cached, fetchAllRows, formatted, loadRegionBUs, lookupId, num, text } from './common';
import type { HubDocument } from './library';

/**
 * Quick Links tables that show cards in Egypt and embedded documents in KSA (legacy):
 * Insurance, Booking Policy, QA Tips, CRM Dictionary, Department Working Hours.
 * Choice labels come from the server's formatted values, so new options show up without code changes.
 */

export interface Choice {
  value: number;
  label: string;
}

/** A choice column read as { value, label }. */
const choice = (row: DataverseRow, name: string): Choice | null => {
  const value = num(row, name);
  return value === null ? null : { value, label: formatted(row, name) || String(value) };
};

/** Distinct choices present in the data, in option-value order (for filter lists). */
export function choicesOf<T>(items: readonly T[], pick: (item: T) => Choice | null): { value: string; label: string }[] {
  const map = new Map<number, string>();
  for (const item of items) {
    const value = pick(item);
    if (value) map.set(value.value, value.label);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([value, label]) => ({ value: String(value), label }));
}

async function regionRows(entity: string, set: string, region: Region, attributes: string[]): Promise<DataverseRow[]> {
  return fetchAllRows(set, activeRowsFetch(entity, attributes, `<condition attribute="cr18c_region" operator="eq" value="${REGION_CHOICE_VALUE[region]}" />`));
}

async function buNames(region: Region): Promise<Map<string, string>> {
  return new Map((await loadRegionBUs(region)).map((bu) => [bu.id, bu.name]));
}

// ---- Insurance ----

export interface InsuranceCompany extends HubDocument {
  type: Choice | null;
  bu: Choice | null;
  uncovered: string;
  notes: string;
}

export function loadInsurance(region: Region): Promise<InsuranceCompany[]> {
  return cached(`insurance:${region}`, async () => {
    const rows = await regionRows('cr18c_servicehubinsurancecompany', 'cr18c_servicehubinsurancecompanies', region, [
      'cr18c_servicehubinsurancecompanyid', 'cr18c_companyname', 'cr18c_companytype', 'cr18c_bu', 'cr18c_uncoveredservice', 'cr18c_notes', 'cr18c_iframeurl',
    ]);
    return rows
      .map((row) => ({
        id: text(row, 'cr18c_servicehubinsurancecompanyid'),
        name: text(row, 'cr18c_companyname'),
        url: text(row, 'cr18c_iframeurl'),
        type: choice(row, 'cr18c_companytype'),
        bu: choice(row, 'cr18c_bu'),
        uncovered: text(row, 'cr18c_uncoveredservice'),
        notes: text(row, 'cr18c_notes'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ---- Booking policy ----

export interface BookingPolicy extends HubDocument {
  buId: string;
  buName: string;
  policy: string;
  notes: string;
}

export function loadBookingPolicies(region: Region): Promise<BookingPolicy[]> {
  return cached(`booking-policy:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      buNames(region),
      regionRows('cr18c_servhubbookingpolicy', 'cr18c_servhubbookingpolicies', region, ['cr18c_servhubbookingpolicyid', 'cr18c_name', 'cr18c_iframeurl', 'cr18c_bookingpolicy', 'cr18c_notes', 'cr18c_bun']),
    ]);
    return rows.map((row) => ({
      id: text(row, 'cr18c_servhubbookingpolicyid'),
      name: text(row, 'cr18c_name') || 'Policy',
      url: text(row, 'cr18c_iframeurl'),
      buId: lookupId(row, 'cr18c_bun'),
      buName: bus.get(lookupId(row, 'cr18c_bun')) ?? formatted(row, 'cr18c_bun'),
      policy: text(row, 'cr18c_bookingpolicy'),
      notes: text(row, 'cr18c_notes'),
    }));
  });
}

// ---- QA tips ----

export interface QaTip extends HubDocument {
  buId: string;
  buName: string;
  service: Choice | null;
  comment: string;
  details: string;
}

export function loadQaTips(region: Region): Promise<QaTip[]> {
  return cached(`qa-tips:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      buNames(region),
      regionRows('cr18c_servhubqualityassurancetips', 'cr18c_servhubqualityassurancetipses', region, [
        'cr18c_servhubqualityassurancetipsid', 'cr18c_tipname', 'cr18c_iframeurl', 'cr18c_service', 'cr18c_comment', 'servhub_bun', 'servhub_tipdetails',
      ]),
    ]);
    return rows
      .map((row) => ({
        id: text(row, 'cr18c_servhubqualityassurancetipsid'),
        name: text(row, 'cr18c_tipname') || 'QA Tip',
        url: text(row, 'cr18c_iframeurl'),
        buId: lookupId(row, 'servhub_bun'),
        buName: bus.get(lookupId(row, 'servhub_bun')) ?? formatted(row, 'servhub_bun'),
        service: choice(row, 'cr18c_service'),
        comment: text(row, 'cr18c_comment'),
        details: text(row, 'servhub_tipdetails'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ---- CRM dictionary ----

export interface CrmEntry extends HubDocument {
  reason: Choice | null;
  type: string;
}

export function loadCrmDictionary(region: Region): Promise<CrmEntry[]> {
  return cached(`crm-dictionary:${region}`, async () => {
    const rows = await regionRows('cr18c_servhubcrmdictionary', 'cr18c_servhubcrmdictionaries', region, ['cr18c_servhubcrmdictionaryid', 'cr18c_reason', 'cr18c_iframeurl', 'cr18c_feedbackreason', 'cr18c_type']);
    return rows
      .map((row) => ({
        id: text(row, 'cr18c_servhubcrmdictionaryid'),
        name: text(row, 'cr18c_reason'),
        url: text(row, 'cr18c_iframeurl'),
        reason: choice(row, 'cr18c_feedbackreason'),
        type: text(row, 'cr18c_type'),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ---- Department working hours ----

export interface WorkingHours extends HubDocument {
  buId: string;
  buName: string;
  department: Choice | null;
  type: Choice | null;
  hours: string;
}

export function loadWorkingHours(region: Region): Promise<WorkingHours[]> {
  return cached(`working-hours:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      buNames(region),
      regionRows('cr18c_departmentworkinghours', 'cr18c_departmentworkinghourses', region, [
        'cr18c_departmentworkinghoursid', 'cr18c_name', 'cr18c_iframeurl', 'cr18c_type', 'cr18c_department', 'cr18c_workinghours', 'cr18c_bun',
      ]),
    ]);
    return rows.map((row) => ({
      id: text(row, 'cr18c_departmentworkinghoursid'),
      name: text(row, 'cr18c_name'),
      url: text(row, 'cr18c_iframeurl'),
      buId: lookupId(row, 'cr18c_bun'),
      buName: bus.get(lookupId(row, 'cr18c_bun')) ?? formatted(row, 'cr18c_bun'),
      department: choice(row, 'cr18c_department'),
      type: choice(row, 'cr18c_type'),
      hours: text(row, 'cr18c_workinghours'),
    }));
  });
}
