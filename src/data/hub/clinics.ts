import type { Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, loadRegionBUs, lookupId, text } from './common';

/** Procedure Clinics (Egypt) and Bank Accounts (KSA). */

export interface ClinicRecord {
  name: string;
  nameAr: string;
  buId: string;
  buName: string;
  details: string;
}

export interface ProcedureClinics {
  records: ClinicRecord[];
  /** Business units that have at least one clinic. */
  bus: { id: string; name: string }[];
}

export function loadProcedureClinics(region: Region): Promise<ProcedureClinics> {
  return cached(`procedure-clinics:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('servhub_procedcureclincs', activeRowsFetch('servhub_procedcureclinc', ['servhub_clinic', 'servhub_clinicar', 'cr18c_details', 'cr18c_bun'])),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const records = rows
      .map((row) => ({
        name: text(row, 'servhub_clinic'),
        nameAr: text(row, 'servhub_clinicar'),
        buId: lookupId(row, 'cr18c_bun'),
        buName: buName.get(lookupId(row, 'cr18c_bun')) ?? '',
        details: text(row, 'cr18c_details'),
      }))
      .filter((record) => record.name || record.nameAr);
    const usedBus = new Set(records.map((record) => record.buId));
    return { records, bus: bus.filter((bu) => usedBus.has(bu.id)) };
  });
}

/** One card per distinct clinic name (legacy renderProcedureClinicCards). */
export function distinctClinics(records: readonly ClinicRecord[]): { name: string; nameAr: string }[] {
  const seen = new Set<string>();
  const clinics: { name: string; nameAr: string }[] = [];
  for (const record of records) {
    const key = record.name || record.nameAr;
    if (seen.has(key)) continue;
    seen.add(key);
    clinics.push({ name: record.name, nameAr: record.nameAr });
  }
  return clinics.sort((a, b) => (a.name || a.nameAr).localeCompare(b.name || b.nameAr));
}

export interface BankAccount {
  buId: string;
  buName: string;
  bankName: string;
  owner: string;
  accountNumber: string;
  iban: string;
  notes: string;
}

/** Bank accounts of the region's business units (legacy loadBankAccounts, KSA). */
export function loadBankAccounts(region: Region): Promise<BankAccount[]> {
  return cached(`bank-accounts:${region}`, async () => {
    const [bus, rows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('cr301_bankaccountses', activeRowsFetch('cr301_bankaccounts', ['cr301_bankname', 'cr301_accountowner', 'cr301_accountnumber', 'cr301_ibannumber', 'cr301_notes', 'cr18c_bun'])),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    return rows
      .filter((row) => buName.has(lookupId(row, 'cr18c_bun')))
      .map((row) => ({
        buId: lookupId(row, 'cr18c_bun'),
        buName: buName.get(lookupId(row, 'cr18c_bun')) ?? '',
        bankName: text(row, 'cr301_bankname'),
        owner: text(row, 'cr301_accountowner'),
        accountNumber: text(row, 'cr301_accountnumber'),
        iban: text(row, 'cr301_ibannumber'),
        notes: text(row, 'cr301_notes'),
      }));
  });
}
