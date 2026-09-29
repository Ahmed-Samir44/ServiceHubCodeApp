import type { Region } from '../../app/region';
import type { DataverseRow } from '../dataverse';
import { activeRowsFetch, cached, fetchAllRows, formatted, loadRegionBUs, lookupId, num, text, type BusinessUnit } from './common';
import { loadSpecialties, loadSpecialtyMappings, type Specialty } from './specialties';

/**
 * Doctors Directory data — the same tables and rules as the legacy web resource (region.html):
 * a doctor is listed only when they have an OPD consultation-fee row in one of the region's
 * business units; KSA specialties go through the dotcare → final specialty mapping.
 */

export interface Fee {
  doctorId: string;
  buId: string;
  original: string;
  affiliate: string;
  contract: string;
  walkIn: string;
  firstPriority: boolean;
}

export interface NamedRow {
  id: string;
  name: string;
}

export interface DoctorException {
  doctorId: string;
  type: string;
  reason: string;
  from: Date;
  to: Date;
  bu: string;
  procedureClinics: string;
}

export interface ProcedureClinic {
  name: string;
  nameAr: string;
}

export interface Doctor {
  id: string;
  title: string;
  nameEn: string;
  nameAr: string;
  specialtyId: string;
  subSpecialtyId: string;
  subSpecialtyName: string;
  /** Names Dataverse sends with the row — used when a lookup isn't in the loaded lists (e.g. inactive). */
  specialtyLabel: string;
  degreeLabel: string;
  nationalityLabel: string;
  degreeId: string;
  nationalityId: string;
  contractType: number | null;
  starDoctor: number | null;
  exclusiveness: number | null;
  examinationAge: string;
  insuranceIssues: string;
  staffExLimitation: string;
  scopeEn: string;
  scopeAr: string;
  qualificationsEn: string;
  qualificationsAr: string;
  notes: string;
  procedureClinics: string;
}

export interface DoctorsData {
  region: Region;
  bus: BusinessUnit[];
  /** Doctors visible in this region (have an OPD fee in a region BU), sorted by English name. */
  doctors: Doctor[];
  feesByDoctor: Map<string, Fee[]>;
  specialties: Map<string, Specialty>;
  subSpecialties: Map<string, NamedRow>;
  degrees: Map<string, NamedRow>;
  nationalities: Map<string, NamedRow>;
  /** KSA: dotcare specialty id -> final specialty id. */
  specialtyMap: Map<string, string>;
  exceptions: DoctorException[];
  /** EGY procedure clinics (servhub_procedcureclinc), used to name the clinics on doctor cards. */
  clinics: ProcedureClinic[];
}

const DOCTOR_FIELDS = [
  'cr301_newdoctordatasetid', 'cr301_title', 'cr603_insuranceissues', 'cr603_staffexlimitation', 'cr301_doctornamear',
  'servhub_doctornameen', 'cr301_contracttype', 'cr301_stardoctor', 'cr301_specialty', 'cr301_subspecialty', 'cr301_degree',
  'servhub_examinationage', 'cr301_nationality', 'cr301_scopeofservicear', 'cr301_scopeofservice', 'cr301_qualificationsandexperience',
  'cr18c_exclusiveness', 'servhub_procedureclinics', 'cr301_qualificationsandexperiencear', 'cr301_drnotes', 'cr301_opdflag',
];

const FEE_FIELDS = [
  'cr301_table1id', 'cr301_originalconsultationfees', 'cr301_affiliateconsultationfees', 'cr301_contractconsultationfees',
  'cr301_walkinconsultationfees', 'cr301_doctorname', 'cr301_businessunit', 'cr301_firstpriorityfx', 'cr301_firstpriority', 'cr18c_manualopdflag',
];

const toNamed = (rows: DataverseRow[], idField: string, nameField = 'cr301_title') =>
  new Map(rows.map((row) => [text(row, idField), { id: text(row, idField), name: text(row, nameField) }]));

const isFirstPriority = (row: DataverseRow) => {
  const flag = row.cr301_firstpriority;
  return text(row, 'cr301_firstpriorityfx') === '🥇' || flag === true || flag === 1;
};

const toDate = (value: string) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export function loadDoctorsData(region: Region): Promise<DoctorsData> {
  return cached(`doctors:${region}`, async () => {
    const opdFees = `<filter type="or"><condition attribute="servhub_opdflag" operator="eq" value="OPD" /><condition attribute="cr18c_manualopdflag" operator="eq" value="OPD" /></filter>`;
    const [bus, doctorRows, feeRows, specialtyList, subRows, degreeRows, nationalityRows, mappings, exceptionRows, clinicRows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('cr301_newdoctordatasets', activeRowsFetch('cr301_newdoctordataset', DOCTOR_FIELDS)),
      fetchAllRows('cr301_table1s', activeRowsFetch('cr301_table1', FEE_FIELDS, opdFees)),
      loadSpecialties(),
      fetchAllRows('cr301_subspecialtyksa_service_hubs', activeRowsFetch('cr301_subspecialtyksa_service_hub', ['cr301_subspecialtyksa_service_hubid', 'cr301_title'])),
      fetchAllRows('cr301_doctordegreeksa_service_hubs', activeRowsFetch('cr301_doctordegreeksa_service_hub', ['cr301_doctordegreeksa_service_hubid', 'cr301_title'])),
      fetchAllRows('cr301_doctornationalityksa_service_hubs', activeRowsFetch('cr301_doctornationalityksa_service_hub', ['cr301_doctornationalityksa_service_hubid', 'cr301_title'])),
      loadSpecialtyMappings(),
      fetchAllRows('cr301_doctorexceptionreasons', `<fetch version="1.0" mapping="logical"><entity name="cr301_doctorexceptionreason"><all-attributes /><filter type="and"><condition attribute="statecode" operator="eq" value="0" /></filter></entity></fetch>`).catch(() => []),
      region === 'EGY'
        ? fetchAllRows('servhub_procedcureclincs', activeRowsFetch('servhub_procedcureclinc', ['servhub_clinic', 'servhub_clinicar'])).catch(() => [])
        : Promise.resolve([]),
    ]);

    const regionBUs = new Set(bus.map((bu) => bu.id));
    const feesByDoctor = new Map<string, Fee[]>();
    for (const row of feeRows) {
      // Legacy rule: a manual OPD flag of "NONE" hides the fee row.
      if (text(row, 'cr18c_manualopdflag').trim().toUpperCase() === 'NONE') continue;
      const buId = lookupId(row, 'cr301_businessunit');
      if (!regionBUs.has(buId)) continue;
      const fee: Fee = {
        doctorId: lookupId(row, 'cr301_doctorname'),
        buId,
        original: text(row, 'cr301_originalconsultationfees'),
        affiliate: text(row, 'cr301_affiliateconsultationfees'),
        contract: text(row, 'cr301_contractconsultationfees'),
        walkIn: text(row, 'cr301_walkinconsultationfees'),
        firstPriority: region === 'EGY' && isFirstPriority(row),
      };
      const list = feesByDoctor.get(fee.doctorId) ?? [];
      list.push(fee);
      feesByDoctor.set(fee.doctorId, list);
    }
    for (const list of feesByDoctor.values()) list.sort((a, b) => Number(b.firstPriority) - Number(a.firstPriority));

    const doctors: Doctor[] = doctorRows
      .map((row) => ({
        id: text(row, 'cr301_newdoctordatasetid'),
        title: text(row, 'cr301_title'),
        nameEn: text(row, 'servhub_doctornameen'),
        nameAr: text(row, 'cr301_doctornamear'),
        specialtyId: lookupId(row, 'cr301_specialty'),
        subSpecialtyId: lookupId(row, 'cr301_subspecialty'),
        subSpecialtyName: formatted(row, 'cr301_subspecialty'),
        specialtyLabel: formatted(row, 'cr301_specialty'),
        degreeLabel: formatted(row, 'cr301_degree'),
        nationalityLabel: formatted(row, 'cr301_nationality'),
        degreeId: lookupId(row, 'cr301_degree'),
        nationalityId: lookupId(row, 'cr301_nationality'),
        contractType: num(row, 'cr301_contracttype'),
        starDoctor: num(row, 'cr301_stardoctor'),
        exclusiveness: num(row, 'cr18c_exclusiveness'),
        examinationAge: text(row, 'servhub_examinationage'),
        insuranceIssues: text(row, 'cr603_insuranceissues'),
        staffExLimitation: text(row, 'cr603_staffexlimitation'),
        scopeEn: text(row, 'cr301_scopeofservice'),
        scopeAr: text(row, 'cr301_scopeofservicear'),
        qualificationsEn: text(row, 'cr301_qualificationsandexperience'),
        qualificationsAr: text(row, 'cr301_qualificationsandexperiencear'),
        notes: text(row, 'cr301_drnotes'),
        procedureClinics: text(row, 'servhub_procedureclinics'),
      }))
      .filter((doctor) => (feesByDoctor.get(doctor.id)?.length ?? 0) > 0)
      .sort((a, b) => (a.nameEn || a.title).localeCompare(b.nameEn || b.title));

    const specialties = new Map(specialtyList.map((specialty) => [specialty.id, specialty]));
    const specialtyMap = new Map(mappings.map((mapping) => [mapping.from, mapping.to]));

    const exceptions: DoctorException[] = exceptionRows
      .map((row) => ({
        doctorId: lookupId(row, 'cr301_doctor_name') || lookupId(row, 'cr301_doctorname') || lookupId(row, 'cr301_doctor'),
        type: text(row, 'cr301_exception_type'),
        reason: text(row, 'cr301_exception_reason'),
        from: toDate(text(row, 'cr301_from')),
        to: toDate(text(row, 'cr301_to')),
        bu: formatted(row, 'cr301_businessunit'),
        procedureClinics: text(row, 'servhub_procedureclinics'),
      }))
      .filter((item) => item.doctorId && !Number.isNaN(item.from.getTime()) && !Number.isNaN(item.to.getTime()));

    return {
      region,
      bus,
      doctors,
      feesByDoctor,
      specialties,
      subSpecialties: toNamed(subRows, 'cr301_subspecialtyksa_service_hubid'),
      degrees: toNamed(degreeRows, 'cr301_doctordegreeksa_service_hubid'),
      nationalities: toNamed(nationalityRows, 'cr301_doctornationalityksa_service_hubid'),
      specialtyMap,
      exceptions,
      clinics: clinicRows.map((row) => ({ name: text(row, 'servhub_clinic'), nameAr: text(row, 'servhub_clinicar') })).filter((clinic) => clinic.name),
    };
  });
}

/** Specialty shown for a doctor: KSA maps dotcare specialties to their final specialty. */
export function doctorSpecialtyId(data: DoctorsData, doctor: Doctor): string {
  if (data.region === 'KSA') return data.specialtyMap.get(doctor.specialtyId) ?? doctor.specialtyId;
  return doctor.specialtyId;
}

/** Exceptions that haven't ended yet (legacy: to >= today). */
export function activeExceptions(data: DoctorsData, doctorId: string): DoctorException[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return data.exceptions.filter((item) => item.doctorId === doctorId && item.to >= today);
}

export const hasFirstPriority = (data: DoctorsData, doctorId: string) => (data.feesByDoctor.get(doctorId) ?? []).some((fee) => fee.firstPriority);

export const CONTRACT_TYPES: Record<number, string> = { 1: 'Full Time', 2: 'Modified Time', 3: 'Part Time', 4: 'Fulltime - ShiftBased' };
export const STAR_DOCTOR: Record<number, string> = { 3: 'First Priority', 1: 'Yes', 2: 'No' };

/** Alex group in the Egypt business-unit filter (legacy ALEX_CHILD_NAMES). */
export const ALEX_BU_NAMES = ['ash', 'smh', 'arc', 'aac', 'asc'];

/** Legacy normalizeClinicName: case, spacing and punctuation-insensitive (keeps Arabic letters). */
export const normalizeClinicName = (value: string) =>
  value.toLowerCase().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/[^\w\s\u0600-\u06FF-]/g, '').trim();

const splitClinics = (value: string) => value.split(',').map((name) => name.trim()).filter(Boolean);

/** Clinics a doctor works in: their own list plus clinics on their exception rows (legacy getClinicsForDoctor). */
export function clinicsForDoctor(data: DoctorsData, doctor: Doctor): ProcedureClinic[] {
  const names = new Set(splitClinics(doctor.procedureClinics));
  for (const item of data.exceptions) if (item.doctorId === doctor.id) splitClinics(item.procedureClinics).forEach((name) => names.add(name));
  return [...names].map((name) => {
    const key = normalizeClinicName(name);
    return data.clinics.find((clinic) => normalizeClinicName(clinic.name) === key || normalizeClinicName(clinic.nameAr) === key) ?? { name, nameAr: '' };
  });
}

/** Specialty ids that have at least one visible doctor (legacy getSpecialtyIdsWithDoctors). */
export function specialtyIdsWithDoctors(data: DoctorsData): Set<string> {
  return new Set(data.doctors.map((doctor) => doctorSpecialtyId(data, doctor)).filter(Boolean));
}

/**
 * Whether a doctor works in a procedure clinic, matching the clinic by its English or Arabic name
 * and including clinics listed on the doctor's exceptions (legacy doctorHasClinic).
 */
export function doctorHasClinic(data: DoctorsData, doctor: Doctor, clinicName: string): boolean {
  const wanted = normalizeClinicName(clinicName);
  const names = new Set([wanted]);
  for (const clinic of data.clinics) {
    if (normalizeClinicName(clinic.name) === wanted || normalizeClinicName(clinic.nameAr) === wanted) {
      if (clinic.name) names.add(normalizeClinicName(clinic.name));
      if (clinic.nameAr) names.add(normalizeClinicName(clinic.nameAr));
    }
  }
  return clinicsForDoctor(data, doctor).some((clinic) => names.has(normalizeClinicName(clinic.name)) || (clinic.nameAr !== '' && names.has(normalizeClinicName(clinic.nameAr))));
}
