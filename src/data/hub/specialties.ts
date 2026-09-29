import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, loadRegionBUs, lookupId, num, text, xmlValue } from './common';

/** Specialty lookups shared by the Service Hub sections (legacy loadSpecialties / loadSpecialtyMappings). */

export interface Specialty {
  id: string;
  name: string;
  arabicName: string;
  region: number | null;
  /** Comma-separated business-unit names (servhub_butxt), used by the Specialties BU filter. */
  buNames: string;
  valueProposition: string;
}

export interface SpecialtyMapping {
  /** Raw (dotcare) specialty id. */
  from: string;
  /** Final specialty id it is shown as. */
  to: string;
}

export function loadSpecialties(): Promise<Specialty[]> {
  return cached('specialties', async () => {
    const rows = await fetchAllRows(
      'cr301_specialtyksa_service_hubs',
      activeRowsFetch('cr301_specialtyksa_service_hub', ['cr301_specialtyksa_service_hubid', 'cr18c_region', 'cr301_title', 'cr301_arabicname', 'servhub_butxt', 'cr301_valueproposition']),
    );
    return rows.map((row) => ({
      id: text(row, 'cr301_specialtyksa_service_hubid'),
      name: text(row, 'cr301_title'),
      arabicName: text(row, 'cr301_arabicname'),
      region: num(row, 'cr18c_region'),
      buNames: text(row, 'servhub_butxt'),
      valueProposition: text(row, 'cr301_valueproposition'),
    }));
  });
}

/** KSA dotcare → final specialty mapping; an unavailable table just means no mapping (legacy behaviour). */
export function loadSpecialtyMappings(): Promise<SpecialtyMapping[]> {
  return cached('specialty-mappings', async () => {
    const rows = await fetchAllRows('cr18c_servhubspecialtymappings', activeRowsFetch('cr18c_servhubspecialtymapping', ['cr18c_dotcarespecialty', 'cr18c_finalspecialty'])).catch(() => []);
    return rows.map((row) => ({ from: lookupId(row, 'cr18c_dotcarespecialty'), to: lookupId(row, 'cr18c_finalspecialty') })).filter((mapping) => mapping.from && mapping.to);
  });
}

/** Specialties of a region (or without a region), sorted by name — the legacy filter lists. */
export function regionSpecialties(specialties: readonly Specialty[], region: Region): Specialty[] {
  const code = REGION_CHOICE_VALUE[region];
  return specialties.filter((specialty) => specialty.region === null || specialty.region === code).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every specialty id treated as "the same specialty" as the selected one: itself, its mapped final
 * specialty and every raw specialty mapped to that final one (legacy getEquivalentSpecialtyIds).
 */
export function equivalentSpecialtyIds(mappings: readonly SpecialtyMapping[], specialtyId: string): string[] {
  const finalId = mappings.find((mapping) => mapping.from === specialtyId)?.to ?? specialtyId;
  const rawIds = mappings.filter((mapping) => mapping.to === finalId).map((mapping) => mapping.from);
  return [...new Set([finalId, specialtyId, ...rawIds])];
}

export interface SpecialtyNote {
  buId: string;
  buName: string;
  topic: string;
  details: string;
}

export interface SpecialtyGeneralDetail {
  subSpecialty: string;
  details: string;
}

export interface SpecialtyDetails {
  /** "Important Notes" per business unit of the region (cr301_detailsbybu). */
  notes: SpecialtyNote[];
  /** "General Details" of the region or of every region (cr301_specialtydetail). */
  general: SpecialtyGeneralDetail[];
}

/** Legacy openSpecialtyDetails: notes by business unit + general details for one specialty. */
export async function loadSpecialtyDetails(region: Region, specialtyId: string): Promise<SpecialtyDetails> {
  const id = xmlValue(specialtyId);
  const [bus, noteRows, generalRows] = await Promise.all([
    loadRegionBUs(region),
    fetchAllRows('cr301_detailsbybus', activeRowsFetch('cr301_detailsbybu', ['cr301_topic', 'cr301_details', 'cr18c_bun', 'cr301_specialty'], `<condition attribute="cr301_specialty" operator="eq" value="${id}" />`)),
    fetchAllRows(
      'cr301_specialtydetails',
      activeRowsFetch(
        'cr301_specialtydetail',
        ['cr301_subspeciality', 'cr301_details', 'cr18c_region'],
        `<condition attribute="cr301_specialty" operator="eq" value="${id}" /><filter type="or"><condition attribute="cr18c_region" operator="null" /><condition attribute="cr18c_region" operator="eq" value="${REGION_CHOICE_VALUE[region]}" /></filter>`,
      ),
    ),
  ]);
  const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
  return {
    notes: noteRows
      .map((row) => ({ buId: lookupId(row, 'cr18c_bun'), buName: '', topic: text(row, 'cr301_topic'), details: text(row, 'cr301_details') }))
      .filter((note) => buName.has(note.buId))
      .map((note) => ({ ...note, buName: buName.get(note.buId) ?? '' })),
    general: generalRows.map((row) => ({ subSpecialty: text(row, 'cr301_subspeciality'), details: text(row, 'cr301_details') })),
  };
}
