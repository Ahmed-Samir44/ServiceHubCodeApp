import {
  Bank,
  Book,
  Box,
  Calendar,
  Card,
  Clock,
  Crown1,
  DiscountShape,
  DocumentText,
  DocumentText1,
  Health,
  Heart,
  Home2,
  Hospital,
  Link,
  Location,
  MedalStar,
  MessageQuestion,
  Microscope,
  Profile2User,
  Scissor,
  Setting2,
  ShieldTick,
  TickCircle,
  type Icon,
} from 'iconsax-react';
import type { Region } from './region';

/**
 * Sections of the "Andalusia Service Hub" page — the rebuilt legacy web resource (region.html).
 * Top-nav labels and order, the Quick Links / Health Libraries sub-tabs, and page titles and
 * subtitles all mirror the legacy page so users see the same names in the same places.
 */

export type HubSectionId =
  | 'doctors'
  | 'services'
  | 'packages'
  | 'specialties'
  | 'coe'
  | 'locations'
  | 'procedure-clinics'
  | 'bank-accounts'
  | 'offers'
  | 'programs'
  | 'home-care'
  | 'scripts'
  | 'insurance'
  | 'events'
  | 'installments'
  | 'booking-policy'
  | 'system-links'
  | 'qa-tips'
  | 'crm-dictionary'
  | 'working-hours'
  | 'special-handling'
  | 'cpgs'
  | 'capex'
  | 'other-health-info';

/** Legacy top-nav entries that open a group of sub-tabs instead of a single screen. */
export type HubGroupId = 'quick-links' | 'health-libraries';

interface PageHeading {
  title: string;
  subtitle: string;
}

export interface HubSection {
  id: HubSectionId;
  /** Tab text — same wording as the legacy nav bar / internal tabs. */
  label: string;
  icon: Icon;
  /** Set for sections that live under a legacy top-nav group (Quick Links, Health Libraries). */
  group?: HubGroupId;
  /** Regions where the section exists. Hidden elsewhere. */
  regions: readonly Region[];
  /** Page header (legacy h1 + subtitle). Some sections word it differently per region. */
  heading: PageHeading | Record<Region, PageHeading>;
}

export interface HubGroup {
  id: HubGroupId;
  label: string;
  icon: Icon;
}

const BOTH: readonly Region[] = ['EGY', 'KSA'];
const EGY_ONLY: readonly Region[] = ['EGY'];
const KSA_ONLY: readonly Region[] = ['KSA'];

export const HUB_GROUPS: Record<HubGroupId, HubGroup> = {
  'quick-links': { id: 'quick-links', label: 'Quick Links', icon: DocumentText },
  'health-libraries': { id: 'health-libraries', label: 'Health Libraries', icon: DocumentText1 },
};

export const HUB_SECTIONS: readonly HubSection[] = [
  { id: 'doctors', label: 'Doctors', icon: Profile2User, regions: BOTH, heading: { title: 'Doctors Directory', subtitle: 'Search and filter doctors' } },
  { id: 'services', label: 'Services', icon: Health, regions: BOTH, heading: { title: 'Andalusia Services', subtitle: 'Browse our medical services' } },
  { id: 'packages', label: 'Packages', icon: Box, regions: BOTH, heading: { title: 'Andalusia Packages', subtitle: 'Browse our medical packages' } },
  { id: 'specialties', label: 'Specialties', icon: Hospital, regions: BOTH, heading: { title: 'Medical Specialties', subtitle: 'Browse specialties' } },
  { id: 'coe', label: 'COE', icon: MedalStar, regions: BOTH, heading: { title: 'Centers of Excellence', subtitle: 'Explore specialized clinics' } },
  { id: 'locations', label: 'Locations', icon: Location, regions: BOTH, heading: { title: 'Andalusia Locations', subtitle: 'Find Andalusia branches' } },

  // Quick Links — legacy internal tab order
  {
    id: 'scripts', group: 'quick-links', label: 'Scripts & Knowledge', icon: DocumentText, regions: BOTH,
    heading: {
      EGY: { title: 'EGY Scripts & Knowledge', subtitle: 'Internal scripts & knowledge hub – Egypt' },
      KSA: { title: 'Scripts & Knowledge', subtitle: 'Internal scripts & knowledge hub' },
    },
  },
  {
    id: 'insurance', group: 'quick-links', label: 'Insurance', icon: ShieldTick, regions: BOTH,
    heading: {
      EGY: { title: 'Insurance', subtitle: 'Insurance companies – Egypt' },
      KSA: { title: 'Insurance', subtitle: 'Insurance companies – KSA' },
    },
  },
  { id: 'events', group: 'quick-links', label: 'Events', icon: Calendar, regions: KSA_ONLY, heading: { title: 'Events', subtitle: 'Internal events & schedules' } },
  { id: 'installments', group: 'quick-links', label: 'Installments', icon: Card, regions: KSA_ONLY, heading: { title: 'Installments', subtitle: 'Installment plans & schedules' } },
  {
    id: 'booking-policy', group: 'quick-links', label: 'Booking Policy & Discounts', icon: Book, regions: BOTH,
    heading: {
      EGY: { title: 'Booking Policy & Discounts', subtitle: 'Egypt – Booking policy by Business Unit' },
      KSA: { title: 'Booking Policy & Discounts', subtitle: 'KSA – Booking policy' },
    },
  },
  {
    id: 'system-links', group: 'quick-links', label: 'System Links', icon: Link, regions: BOTH,
    heading: {
      EGY: { title: 'System Links', subtitle: 'Egypt – Hospital systems' },
      KSA: { title: 'System Links', subtitle: 'KSA – Hospital systems' },
    },
  },
  {
    id: 'qa-tips', group: 'quick-links', label: 'Quality Assurance Tips', icon: TickCircle, regions: BOTH,
    heading: {
      EGY: { title: 'Quality Assurance Tips', subtitle: 'Egypt – QA guidelines' },
      KSA: { title: 'Quality Assurance Tips', subtitle: 'KSA – QA guidelines' },
    },
  },
  {
    id: 'crm-dictionary', group: 'quick-links', label: 'CRM Dictionary', icon: MessageQuestion, regions: BOTH,
    heading: {
      EGY: { title: 'CRM Dictionary', subtitle: 'Egypt – CRM reasons & definitions' },
      KSA: { title: 'CRM Dictionary', subtitle: 'KSA – CRM references' },
    },
  },
  {
    id: 'working-hours', group: 'quick-links', label: 'Department Working Hours', icon: Clock, regions: BOTH,
    heading: {
      EGY: { title: 'Department Working Hours', subtitle: 'Egypt – Departments & working hours' },
      KSA: { title: 'Department Working Hours', subtitle: 'KSA – Departments references' },
    },
  },
  { id: 'special-handling', group: 'quick-links', label: 'Special Handling', icon: Setting2, regions: KSA_ONLY, heading: { title: 'Special Handling', subtitle: 'Special cases & handling procedures' } },

  { id: 'procedure-clinics', label: 'Procedure Clinics', icon: Scissor, regions: EGY_ONLY, heading: { title: 'Procedure Clinics', subtitle: 'Egypt Procedure Clinics' } },
  { id: 'bank-accounts', label: 'Bank Accounts', icon: Bank, regions: KSA_ONLY, heading: { title: 'Bank Accounts', subtitle: 'KSA Bank Account Information' } },
  {
    id: 'offers', label: 'Offers', icon: DiscountShape, regions: BOTH,
    heading: {
      EGY: { title: 'EGY Offers', subtitle: 'Current medical offers – Egypt' },
      KSA: { title: 'KSA Offers', subtitle: 'Current approved offers – KSA' },
    },
  },
  { id: 'programs', label: 'Programs', icon: Crown1, regions: BOTH, heading: { title: 'Programs', subtitle: 'Programs & packages' } },
  { id: 'home-care', label: 'Home Care', icon: Home2, regions: BOTH, heading: { title: 'Home Care', subtitle: 'Select a Business Unit to get started' } },

  // Health Libraries — legacy tab order (Media Content was never implemented in the legacy page)
  { id: 'cpgs', group: 'health-libraries', label: 'All CPGs & Protocols', icon: DocumentText1, regions: BOTH, heading: { title: 'CPGs & Protocols', subtitle: 'Clinical practice guidelines & protocols' } },
  { id: 'capex', group: 'health-libraries', label: 'CAPEX', icon: Microscope, regions: BOTH, heading: { title: 'CAPEX', subtitle: 'Capital expenditure devices & equipment' } },
  { id: 'other-health-info', group: 'health-libraries', label: 'Other Health Info', icon: Heart, regions: BOTH, heading: { title: 'Other Health Info', subtitle: 'Additional health-related information' } },
];

/** One entry of the legacy top nav: a single section, or a group that opens its first sub-tab. */
export type HubNavEntry =
  | { kind: 'section'; section: HubSection }
  | { kind: 'group'; group: HubGroup; sections: HubSection[] };

export const DEFAULT_HUB_SECTION_ID: HubSectionId = 'doctors';

const sectionById = new Map<HubSectionId, HubSection>(HUB_SECTIONS.map((section) => [section.id, section]));

export const getHubSection = (id: HubSectionId): HubSection => {
  const section = sectionById.get(id);
  if (!section) throw new Error(`Unknown hub section: ${id}`);
  return section;
};

export const isSectionInRegion = (section: HubSection, region: Region): boolean =>
  section.regions.includes(region);

export const sectionHeading = (section: HubSection, region: Region): PageHeading =>
  'title' in section.heading ? section.heading : section.heading[region];

/** Legacy top-nav order for a region; groups sit where the legacy nav link was. */
export function hubNavForRegion(region: Region): HubNavEntry[] {
  const entries: HubNavEntry[] = [];
  const seenGroups = new Set<HubGroupId>();
  for (const section of HUB_SECTIONS) {
    if (!isSectionInRegion(section, region)) continue;
    if (!section.group) {
      entries.push({ kind: 'section', section });
      continue;
    }
    if (seenGroups.has(section.group)) continue;
    seenGroups.add(section.group);
    const groupId = section.group;
    entries.push({
      kind: 'group',
      group: HUB_GROUPS[groupId],
      sections: HUB_SECTIONS.filter((item) => item.group === groupId && isSectionInRegion(item, region)),
    });
  }
  return entries;
}
