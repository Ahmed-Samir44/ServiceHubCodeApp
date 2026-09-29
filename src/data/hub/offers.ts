import type { Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, formatted, idCondition, loadRegionBUs, lookupId, num, text, type BusinessUnit } from './common';
import { loadSpecialties, regionSpecialties, type Specialty } from './specialties';

/**
 * Offers — the legacy EGY Offers (cr301_newofferdataset), KSA Offers (approved new_offer_equest)
 * and KSA Upcoming Offers (approved, not-started new_plannedoffer joined to its original offer).
 */

export type ExpiryStatus = 'soon' | 'active' | 'recentExpired' | 'expired';

export const EXPIRY_LABEL: Record<ExpiryStatus, string> = {
  soon: '⏳ Expiring Soon',
  active: '✅ Active',
  recentExpired: '⚠️ Recently Expired',
  expired: '❌ Expired',
};

/** Filter options (legacy wording: "Not Expiring Soon" is the active state). */
export const EXPIRY_FILTER: { value: ExpiryStatus; label: string }[] = [
  { value: 'soon', label: 'Expiring Soon' },
  { value: 'active', label: 'Not Expiring Soon' },
  { value: 'recentExpired', label: 'Recently Expired' },
  { value: 'expired', label: 'Expired' },
];

/** Dates may come back as ISO values or, from formula columns, as DD/MM/YYYY text. */
export function parseOfferDate(value: string): Date | null {
  if (!value) return null;
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  const date = dmy ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Legacy getOfferExpiryStatus: 0–7 days left = soon, expired within the last 7 days = recently expired. */
export function expiryStatus(end: Date | null): ExpiryStatus {
  if (!end) return 'expired';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(end);
  day.setHours(0, 0, 0, 0);
  const days = Math.ceil((day.getTime() - today.getTime()) / 864e5);
  if (days >= 0 && days <= 7) return 'soon';
  if (days > 7) return 'active';
  if (days >= -7) return 'recentExpired';
  return 'expired';
}

export interface Offer {
  id: string;
  name: string;
  nameAr: string;
  buId: string;
  buName: string;
  specialtyId: string;
  specialtyName: string;
  /** EGY: "1" Flash / "2" Regular; KSA: the offer type name. */
  type: string;
  typeLabel: string;
  priceBefore: number | null;
  priceAfter: number | null;
  description: string;
  start: Date | null;
  end: Date | null;
}

export interface OffersData {
  offers: Offer[];
  bus: BusinessUnit[];
  specialties: { id: string; name: string }[];
  types: { value: string; label: string }[];
}

export function loadEgyOffers(region: Region): Promise<OffersData> {
  return cached(`offers:${region}`, async () => {
    const [bus, allSpecialties, rows] = await Promise.all([
      loadRegionBUs(region),
      loadSpecialties(),
      fetchAllRows(
        'cr301_newofferdatasets',
        activeRowsFetch('cr301_newofferdataset', [
          'cr301_newofferdatasetid', 'cr301_title', 'cr18c_offernamear', 'cr18c_bun', 'cr301_specialty', 'cr301_offertype',
          'cr301_originalprice', 'cr301_offerprice', 'cr301_offerdescription', 'cr301_startdate', 'cr301_enddate',
        ]),
      ),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(allSpecialties.map((specialty: Specialty) => [specialty.id, specialty.name]));
    const offers = rows.map((row) => {
      const type = String(num(row, 'cr301_offertype') ?? '');
      return {
        id: text(row, 'cr301_newofferdatasetid'),
        name: text(row, 'cr301_title'),
        nameAr: text(row, 'cr18c_offernamear'),
        buId: lookupId(row, 'cr18c_bun'),
        buName: buName.get(lookupId(row, 'cr18c_bun')) ?? formatted(row, 'cr18c_bun'),
        specialtyId: lookupId(row, 'cr301_specialty'),
        specialtyName: specialtyName.get(lookupId(row, 'cr301_specialty')) ?? '',
        type,
        typeLabel: type === '1' ? 'Flash Offer' : 'Regular Offer',
        priceBefore: num(row, 'cr301_originalprice'),
        priceAfter: num(row, 'cr301_offerprice'),
        description: text(row, 'cr301_offerdescription'),
        start: parseOfferDate(text(row, 'cr301_startdate')),
        end: parseOfferDate(text(row, 'cr301_enddate')),
      };
    });
    return {
      offers: sortByEnd(offers),
      bus,
      specialties: regionSpecialties(allSpecialties, region).map(({ id, name }) => ({ id, name })),
      types: [
        { value: '1', label: 'Flash Offer' },
        { value: '2', label: 'Regular Offer' },
      ],
    };
  });
}

// ---- KSA ----

const OFFER_ACTIVE = 100000001;

interface KsaLookups {
  bus: BusinessUnit[];
  specialties: { id: string; name: string }[];
  types: { id: string; name: string }[];
}

function loadKsaLookups(region: Region): Promise<KsaLookups> {
  return cached(`offer-lookups:${region}`, async () => {
    const [bus, specialtyRows, typeRows] = await Promise.all([
      loadRegionBUs(region),
      fetchAllRows('crd04_specialtieses', activeRowsFetch('crd04_specialties', ['crd04_specialtiesid', 'crd04_title'])).catch(() => []),
      fetchAllRows('new_offertypes', activeRowsFetch('new_offertype', ['new_offertypeid', 'new_name'])).catch(() => []),
    ]);
    return {
      bus,
      specialties: specialtyRows.map((row) => ({ id: text(row, 'crd04_specialtiesid'), name: text(row, 'crd04_title') })).sort((a, b) => a.name.localeCompare(b.name)),
      types: typeRows.map((row) => ({ id: text(row, 'new_offertypeid'), name: text(row, 'new_name') })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

const OFFER_REQUEST_FIELDS = ['new_offer_equestid', 'new_name', 'new_offernamear', 'new_bu', 'new_specialty', 'new_offertypef', 'new_new_totalserivep', 'new_totalofferafterdiscf', 'new_offerdescriptionar', 'new_startdatef', 'new_offerenddatef'];

export function loadKsaOffers(region: Region): Promise<OffersData> {
  return cached(`offers:${region}`, async () => {
    const [lookups, rows] = await Promise.all([
      loadKsaLookups(region),
      fetchAllRows('new_offer_equests', activeRowsFetch('new_offer_equest', OFFER_REQUEST_FIELDS, `<condition attribute="new_offerstatusnew" operator="eq" value="${OFFER_ACTIVE}" />`)),
    ]);
    const buName = new Map(lookups.bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(lookups.specialties.map((specialty) => [specialty.id, specialty.name]));
    const offers = rows.map((row) => ({
      id: text(row, 'new_offer_equestid'),
      name: text(row, 'new_name'),
      nameAr: text(row, 'new_offernamear'),
      buId: lookupId(row, 'new_bu'),
      buName: buName.get(lookupId(row, 'new_bu')) ?? formatted(row, 'new_bu'),
      specialtyId: lookupId(row, 'new_specialty'),
      specialtyName: specialtyName.get(lookupId(row, 'new_specialty')) ?? formatted(row, 'new_specialty'),
      type: text(row, 'new_offertypef'),
      typeLabel: text(row, 'new_offertypef'),
      priceBefore: num(row, 'new_new_totalserivep'),
      priceAfter: num(row, 'new_totalofferafterdiscf'),
      description: text(row, 'new_offerdescriptionar'),
      start: parseOfferDate(text(row, 'new_startdatef')),
      end: parseOfferDate(text(row, 'new_offerenddatef')),
    }));
    return {
      offers: sortByEnd(offers),
      bus: lookups.bus,
      specialties: lookups.specialties,
      types: lookups.types.map((type) => ({ value: type.name, label: type.name })),
    };
  });
}

/** Approved offers that have not started yet, with their original offer's names, BU and specialty. */
export function loadUpcomingOffers(region: Region): Promise<OffersData> {
  return cached(`upcoming-offers:${region}`, async () => {
    const [lookups, planned] = await Promise.all([
      loadKsaLookups(region),
      fetchAllRows(
        'new_plannedoffers',
        activeRowsFetch(
          'new_plannedoffer',
          ['new_plannedofferid', 'new_originaloffer', 'new_type', 'new_startdatenew', 'new_enddatenew', 'new_totalservicespricebeforediscount', 'new_totalofferafterdiscount'],
          `<condition attribute="new_planvalidity" operator="eq" value="Not Started" /><condition attribute="new_hasfinalapproval" operator="eq" value="1" />`,
        ),
      ),
    ]);
    const originalIds = [...new Set(planned.map((row) => lookupId(row, 'new_originaloffer')).filter(Boolean))];
    const originals = new Map<string, (typeof planned)[number]>();
    for (let index = 0; index < originalIds.length; index += 100) {
      const batch = originalIds.slice(index, index + 100);
      const rows = await fetchAllRows('new_offer_equests', `<fetch version="1.0" mapping="logical"><entity name="new_offer_equest">${OFFER_REQUEST_FIELDS.map((name) => `<attribute name="${name}" />`).join('')}<filter>${idCondition('new_offer_equestid', batch)}</filter></entity></fetch>`);
      for (const row of rows) originals.set(text(row, 'new_offer_equestid'), row);
    }
    const buName = new Map(lookups.bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(lookups.specialties.map((specialty) => [specialty.id, specialty.name]));
    const typeName = new Map(lookups.types.map((type) => [type.id, type.name]));
    const offers = planned.map((row) => {
      const original = originals.get(lookupId(row, 'new_originaloffer'));
      return {
        id: text(row, 'new_plannedofferid'),
        name: text(original, 'new_name'),
        nameAr: text(original, 'new_offernamear'),
        buId: lookupId(original, 'new_bu'),
        buName: buName.get(lookupId(original, 'new_bu')) ?? formatted(original, 'new_bu'),
        specialtyId: lookupId(original, 'new_specialty'),
        specialtyName: specialtyName.get(lookupId(original, 'new_specialty')) ?? formatted(original, 'new_specialty'),
        type: lookupId(row, 'new_type'),
        typeLabel: typeName.get(lookupId(row, 'new_type')) ?? formatted(row, 'new_type'),
        priceBefore: num(row, 'new_totalservicespricebeforediscount'),
        priceAfter: num(row, 'new_totalofferafterdiscount'),
        description: text(original, 'new_offerdescriptionar'),
        start: parseOfferDate(text(row, 'new_startdatenew')),
        end: parseOfferDate(text(row, 'new_enddatenew')),
      };
    });
    return {
      offers: offers.sort((a, b) => (a.start?.getTime() ?? Infinity) - (b.start?.getTime() ?? Infinity)),
      bus: lookups.bus,
      specialties: lookups.specialties,
      types: lookups.types.map((type) => ({ value: type.id, label: type.name })),
    };
  });
}

/** Soonest-ending first, expired offers last. */
function sortByEnd(offers: Offer[]): Offer[] {
  const rank: Record<ExpiryStatus, number> = { soon: 0, active: 1, recentExpired: 2, expired: 3 };
  return offers.sort((a, b) => rank[expiryStatus(a.end)] - rank[expiryStatus(b.end)] || (a.end?.getTime() ?? 0) - (b.end?.getTime() ?? 0));
}
