import { getContext } from '@microsoft/power-apps/app';
import type { HubSectionId } from '../app/hubSections';
import type { Region } from '../app/region';
import { createRow, listRows } from './dataverse';

/**
 * Page usage log, as the legacy page's logPageUsage(screenId): one `cr301_canvaspageusagelogs` row
 * per screen opened, with the legacy screen id as the page name so existing reports keep working.
 * Fire-and-forget: it never blocks or breaks the UI. Not written from `npm run dev` / Local Play,
 * so testing doesn't fill the log.
 */

const LOG_SET = 'cr301_canvaspageusagelogs';
const CONTEXT_TIMEOUT_MS = 4000;

/** Legacy screen ids (region.html `<div id="…Screen">`); the Quick Links pages are per region. */
const REGION_SCREENS: Partial<Record<HubSectionId, string>> = {
  scripts: 'ScriptsScreen',
  insurance: 'InsuranceScreen',
  'booking-policy': 'BookingPolicyScreen',
  'system-links': 'SystemLinksScreen',
  'qa-tips': 'QATipsScreen',
  'crm-dictionary': 'CRMDictionaryScreen',
  'working-hours': 'DepartmentWorkingHoursScreen',
  offers: 'OffersScreen',
};

const SCREENS: Partial<Record<HubSectionId, string>> = {
  doctors: 'doctorsScreen',
  services: 'servicesScreen',
  packages: 'packagesScreen',
  specialties: 'specialtiesScreen',
  coe: 'coeScreen',
  locations: 'locationsScreen',
  events: 'eventsScreen',
  installments: 'installmentsScreen',
  'special-handling': 'specialHandlingScreen',
  'procedure-clinics': 'procedureClinicsScreen',
  'bank-accounts': 'bankAccountsScreen',
  programs: 'programsScreen',
  'home-care': 'servHubHomeCareScreen',
  cpgs: 'cpgsScreen',
  capex: 'capexScreen',
  'other-health-info': 'otherHealthInfoScreen',
};

/** The legacy screen id of a hub section in a region. */
export function legacyScreenId(section: HubSectionId, region: Region): string {
  const perRegion = REGION_SCREENS[section];
  if (perRegion) return `${region === 'EGY' ? 'egy' : 'ksa'}${perRegion}`;
  return SCREENS[section] ?? `${section}Screen`;
}

interface LogUser {
  fullName: string;
  domainName: string;
}

let userPromise: Promise<LogUser> | null = null;

/** The signed-in user's full name and domain name (legacy: systemusers fullname / domainname). */
function logUser(): Promise<LogUser> {
  userPromise ??= (async () => {
    const context = await Promise.race([getContext(), new Promise<null>((resolve) => window.setTimeout(() => resolve(null), CONTEXT_TIMEOUT_MS))]);
    const fallback: LogUser = { fullName: context?.user.fullName ?? '', domainName: context?.user.userPrincipalName ?? '' };
    const objectId = context?.user.objectId;
    if (!objectId) return fallback;
    try {
      const { rows } = await listRows({ entitySet: 'systemusers', select: 'fullname,domainname', filter: `azureactivedirectoryobjectid eq ${objectId}`, top: 1 });
      const row = rows[0];
      return {
        fullName: typeof row?.fullname === 'string' && row.fullname ? row.fullname : fallback.fullName,
        domainName: typeof row?.domainname === 'string' && row.domainname ? row.domainname : fallback.domainName,
      };
    } catch {
      return fallback;
    }
  })();
  return userPromise;
}

/** Logs that a screen was opened. Never throws; does nothing in development. */
export function logPageUsage(pageName: string): void {
  if (import.meta.env.DEV) return;
  // The time the screen opened, not when the user lookup finished.
  const openedAt = new Date().toISOString();
  void (async () => {
    try {
      const user = await logUser();
      await createRow(LOG_SET, {
        cr301_pagename: pageName.slice(0, 100),
        // Primary name column (required): the user's domain name, as in the legacy page.
        cr301_newcolumn: (user.domainName || 'Unknown').slice(0, 850),
        cr301_username: (user.fullName || 'Unknown').slice(0, 100),
        cr301_timestamp: openedAt,
      });
    } catch {
      // Logging must never affect the app.
    }
  })();
}
