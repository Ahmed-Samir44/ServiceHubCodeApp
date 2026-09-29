import type { Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, loadRegionBUs, lookupId, text } from './common';

/** Centers of Excellence and Andalusia Locations (legacy COE / Locations screens). */

export interface CenterOfExcellence {
  id: string;
  clinicName: string;
  leader: string;
  coordinator: string;
  members: string;
  subSpecialties: string;
  buName: string;
  arabicScript: string;
  /** Legacy label "Clinic Booking Process" (EGY). */
  englishScript: string;
  valueProposition: string;
}

export interface CentersData {
  centers: CenterOfExcellence[];
  subSpecialtyNames: string[];
}

/** Centers whose business unit belongs to the region (legacy applyCOEFilters). */
export function loadCenters(region: Region): Promise<CentersData> {
  return cached(`coe:${region}`, async () => {
    const [bus, rows, subRows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows(
        'cr301_coelists',
        activeRowsFetch('cr301_coelist', [
          'cr301_coelistid', 'cr301_coeclinicname', 'cr301_clinicalleader', 'cr301_clinicalcoordinator', 'cr301_coemembers',
          'cr301_valueproposition', 'cr301_txtsubspecialty', 'cr18c_bu', 'cr301_arabicscript', 'cr301_englishscript',
        ]),
      ),
      cached('subspecialties', () => fetchAllRows('cr301_subspecialtyksa_service_hubs', activeRowsFetch('cr301_subspecialtyksa_service_hub', ['cr301_title']))),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const centers = rows
      .filter((row) => buName.has(lookupId(row, 'cr18c_bu')))
      .map((row) => ({
        id: text(row, 'cr301_coelistid'),
        clinicName: text(row, 'cr301_coeclinicname'),
        leader: text(row, 'cr301_clinicalleader'),
        coordinator: text(row, 'cr301_clinicalcoordinator'),
        members: text(row, 'cr301_coemembers'),
        subSpecialties: text(row, 'cr301_txtsubspecialty'),
        buName: buName.get(lookupId(row, 'cr18c_bu')) ?? '',
        arabicScript: text(row, 'cr301_arabicscript'),
        englishScript: text(row, 'cr301_englishscript'),
        valueProposition: text(row, 'cr301_valueproposition'),
      }))
      .sort((a, b) => a.clinicName.localeCompare(b.clinicName));
    const subSpecialtyNames = [...new Set(subRows.map((row) => text(row, 'cr301_title')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { centers, subSpecialtyNames };
  });
}

/** Legacy normalizeText: case-insensitive, slashes and repeated spaces ignored. */
export const normalizeSearch = (value: string) => value.toLowerCase().replace(/\//g, ' ').replace(/\s+/g, ' ').trim();

export interface Location {
  id: string;
  branchName: string;
  area: string;
  address: string;
  imageUrl: string;
  mapUrl: string;
}

/** Branches whose region text contains the region code (legacy loadLocations). */
export function loadLocations(region: Region): Promise<Location[]> {
  return cached(`locations:${region}`, async () => {
    const rows = await fetchAllRows(
      'cr301_andalusialocationses',
      activeRowsFetch('cr301_andalusialocations', ['cr301_andalusialocationsid', 'cr301_image', 'cr301_branchname', 'cr301_description', 'cr301_area', 'cr301_location', 'cr18c_region']),
    );
    return rows
      .filter((row) => text(row, 'cr18c_region').toUpperCase().includes(region))
      .map((row) => ({
        id: text(row, 'cr301_andalusialocationsid'),
        branchName: text(row, 'cr301_branchname'),
        area: text(row, 'cr301_area'),
        address: text(row, 'cr301_description'),
        imageUrl: text(row, 'cr301_image'),
        mapUrl: text(row, 'cr301_location'),
      }))
      .sort((a, b) => a.branchName.localeCompare(b.branchName));
  });
}
