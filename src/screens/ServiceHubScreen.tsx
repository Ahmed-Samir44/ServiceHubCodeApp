import { useEffect, useState } from 'react';
import {
  DEFAULT_HUB_SECTION_ID,
  getHubSection,
  hubNavForRegion,
  isSectionInRegion,
  sectionHeading,
  type HubSection,
  type HubSectionId,
} from '../app/hubSections';
import type { Region } from '../app/region';
import { legacyScreenId, logPageUsage } from '../data/usageLog';
import { RegionOptions } from '../app/RegionModal';
import { RegionMap } from './hub/RegionMap';
import { BankAccountsSection } from './hub/BankAccountsSection';
import { CoeSection } from './hub/CoeSection';
import { DoctorsSection } from './hub/DoctorsSection';
import { HomeCareSection } from './hub/HomeCareSection';
import { CapexSection, DocumentsSection, GuidelinesSection } from './hub/LibrarySections';
import { ScriptsSection } from './hub/ScriptsSection';
import { BookingPolicySection, CrmDictionarySection, InsuranceSection, QaTipsSection, WorkingHoursSection } from './hub/QuickLinksSections';
import { LocationsSection } from './hub/LocationsSection';
import { OffersSection } from './hub/OffersSection';
import { ProcedureClinicsSection } from './hub/ProcedureClinicsSection';
import { ProgramsSection } from './hub/ProgramsSection';
import { ServicesSection } from './hub/ServicesSection';
import { SpecialtiesSection } from './hub/SpecialtiesSection';

interface ServiceHubScreenProps {
  region: Region | null;
  onSelectRegion: (region: Region) => void;
  sectionId: HubSectionId;
  onSelectSection: (id: HubSectionId) => void;
}

/**
 * "Andalusia Service Hub" — the rebuilt legacy web resource. Like the legacy page it opens on
 * the region choice, then shows the legacy top nav (Doctors … Health Libraries).
 */
/**
 * A section opened from another one, pre-selected: a specialty ("Open in Doctors Directory") or a
 * procedure clinic (a clinic name on a doctor card opens its clinic hub).
 */
export interface HubPreset {
  sectionId: HubSectionId;
  specialty?: { id: string; name: string };
  clinic?: string;
}

export function ServiceHubScreen({ region, onSelectRegion, sectionId, onSelectSection }: ServiceHubScreenProps) {
  const [preset, setPreset] = useState<HubPreset | null>(null);
  // Usage log (legacy logPageUsage): one entry per section opened, under its legacy screen id.
  const shownSectionId = region ? (isSectionInRegion(getHubSection(sectionId), region) ? sectionId : DEFAULT_HUB_SECTION_ID) : null;
  useEffect(() => {
    if (region && shownSectionId) logPageUsage(legacyScreenId(shownSectionId, region));
  }, [region, shownSectionId]);
  // Nav clicks open a section clean; openWithPreset opens it pre-filtered.
  const selectSection = (id: HubSectionId) => {
    setPreset(null);
    onSelectSection(id);
  };
  const openWithPreset = (next: HubPreset) => {
    setPreset(next);
    onSelectSection(next.sectionId);
  };

  if (!region) {
    return (
      <>
        <div className="page-hdr">
          <h1 className="page-title">Select Your Region</h1>
          <div className="page-sub">Choose a region to view doctors</div>
        </div>
        <div className="content content-wide">
          <div className="rmap-stage">
            <RegionMap onSelect={onSelectRegion} />
            <div className="rl rl-phone">
              <RegionOptions current={null} onSelect={onSelectRegion} />
            </div>
          </div>
        </div>
      </>
    );
  }

  // A section missing from the current region (e.g. Bank Accounts after switching to Egypt)
  // falls back to Doctors — derived during render rather than synced through an effect.
  const requested = getHubSection(sectionId);
  const active = isSectionInRegion(requested, region) ? requested : getHubSection(DEFAULT_HUB_SECTION_ID);
  const heading = sectionHeading(active, region);
  const nav = hubNavForRegion(region);
  const activeGroup = active.group ? nav.find((entry) => entry.kind === 'group' && entry.group.id === active.group) : undefined;

  return (
    <>
      <div className="page-hdr">
        <h1 className="page-title">{heading.title}</h1>
        <div className="page-sub">{heading.subtitle}</div>
      </div>
      <div className="content content-wide hub-page">
        <nav className="hub-nav" aria-label="Service Hub sections">
          {nav.map((entry) => {
            const isActive = entry.kind === 'section' ? entry.section.id === active.id : entry.group.id === active.group;
            const label = entry.kind === 'section' ? entry.section.label : entry.group.label;
            const EntryIcon = entry.kind === 'section' ? entry.section.icon : entry.group.icon;
            const target = entry.kind === 'section' ? entry.section.id : entry.sections[0].id;
            return (
              <button
                key={entry.kind === 'section' ? entry.section.id : entry.group.id}
                type="button"
                className={`hn-item${isActive ? ' active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => selectSection(target)}
              >
                <EntryIcon size={14} color="currentColor" />
                {label}
              </button>
            );
          })}
        </nav>

        {activeGroup?.kind === 'group' && (
          <div className="bento">
            <div className="sub-hdr">{activeGroup.group.label}</div>
            <div className="filter-bar" role="tablist" aria-label={activeGroup.group.label}>
              {activeGroup.sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  aria-selected={section.id === active.id}
                  className={`btn ${section.id === active.id ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => selectSection(section.id)}
                >
                  <section.icon size={14} color="currentColor" />
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The key includes the preset so a pre-filtered open starts fresh. */}
        <HubSectionContent
          key={`${active.id}:${region}:${preset?.sectionId === active.id ? (preset.specialty?.id ?? preset.clinic ?? '') : ''}`}
          section={active}
          region={region}
          preset={preset?.sectionId === active.id ? preset : null}
          onOpenWithPreset={openWithPreset}
        />
      </div>
    </>
  );
}

/** The live screen of a section (keyed by section + region, so switching resets its state). */
function HubSectionContent({ section, region, preset, onOpenWithPreset }: { section: HubSection; region: Region; preset: HubPreset | null; onOpenWithPreset: (preset: HubPreset) => void }) {
  switch (section.id) {
    case 'doctors':
      return <DoctorsSection region={region} initialSpecialtyId={preset?.specialty?.id} onOpenClinic={region === 'EGY' ? (clinic) => onOpenWithPreset({ sectionId: 'procedure-clinics', clinic }) : undefined} />;
    case 'services':
      return <ServicesSection region={region} kind="services" initialSpecialtyId={preset?.specialty?.id} />;
    case 'packages':
      return <ServicesSection region={region} kind="packages" initialSpecialtyId={preset?.specialty?.id} />;
    case 'specialties':
      return (
        <SpecialtiesSection
          region={region}
          renderOffers={(specialty) => <OffersSection region={region} specialty={specialty} />}
          onOpenInSection={(sectionId, specialty) => onOpenWithPreset({ sectionId, specialty: { id: specialty.id, name: specialty.name } })}
        />
      );
    case 'coe':
      return <CoeSection region={region} />;
    case 'locations':
      return <LocationsSection region={region} />;
    case 'procedure-clinics':
      return <ProcedureClinicsSection region={region} initialClinic={preset?.clinic} />;
    case 'bank-accounts':
      return <BankAccountsSection region={region} />;
    case 'offers':
      return <OffersSection region={region} specialty={preset?.specialty} />;
    case 'programs':
      return <ProgramsSection region={region} />;
    case 'home-care':
      return <HomeCareSection region={region} />;
    case 'events':
    case 'installments':
    case 'special-handling':
    case 'system-links':
    case 'other-health-info':
      return <DocumentsSection region={region} kind={section.id} />;
    case 'cpgs':
      return <GuidelinesSection region={region} />;
    case 'capex':
      return <CapexSection region={region} />;
    case 'scripts':
      return <ScriptsSection region={region} />;
    case 'insurance':
      return <InsuranceSection region={region} />;
    case 'booking-policy':
      return <BookingPolicySection region={region} />;
    case 'qa-tips':
      return <QaTipsSection region={region} />;
    case 'crm-dictionary':
      return <CrmDictionarySection region={region} />;
    case 'working-hours':
      return <WorkingHoursSection region={region} />;
    default: {
      // Every section has a screen; a new HubSectionId fails to compile here until it gets one.
      const missing: never = section.id;
      return missing;
    }
  }
}
