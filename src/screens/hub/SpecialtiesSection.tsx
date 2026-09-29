import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight2, Box1, ExportSquare, Hospital, Profile2User, TicketDiscount } from 'iconsax-react';
import type { Region } from '../../app/region';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { doctorSpecialtyId, loadDoctorsData, specialtyIdsWithDoctors } from '../../data/hub/doctors';
import { loadSpecialtyDetails, regionSpecialties, type Specialty } from '../../data/hub/specialties';
import { useAsyncData } from '../../data/useAsyncData';
import { DoctorsSection } from './DoctorsSection';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, SearchField } from './HubCommon';
import { ServicesSection } from './ServicesSection';

/**
 * Legacy "Medical Specialties": specialty cards (only specialties with doctors), each opening a
 * specialty hub with its Doctors, Services, Packages, Offers and Details.
 */

type HubTarget = 'doctors' | 'services' | 'packages' | 'offers';

type View = { kind: 'list' } | { kind: 'hub'; specialty: Specialty } | { kind: HubTarget; specialty: Specialty };

/** Renders the Offers screen pre-filtered to a specialty (provided by the hub so Offers stays in its own module). */
export type SpecialtyOffersRenderer = (specialty: Specialty) => ReactNode;

/** Main Service Hub section for each specialty-hub target (used by "Open in …"). */
const TARGET_SECTION = { doctors: 'doctors', services: 'services', packages: 'packages', offers: 'offers' } as const;
const TARGET_LABEL = { doctors: 'Doctors', services: 'Services', packages: 'Packages', offers: 'Offers' } as const;
const OPEN_LABEL = { doctors: 'Open in Doctors Directory', services: 'Open in Services', packages: 'Open in Packages', offers: 'Open in Offers' } as const;

export function SpecialtiesSection({
  region,
  renderOffers,
  onOpenInSection,
}: {
  region: Region;
  renderOffers: SpecialtyOffersRenderer;
  /** Opens the main section (e.g. Doctors Directory) with this specialty pre-selected. */
  onOpenInSection: (sectionId: (typeof TARGET_SECTION)[keyof typeof TARGET_SECTION], specialty: Specialty) => void;
}) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const [filters, setFilters] = useState({ bu: '', search: '' });

  if (view.kind === 'list') {
    return <SpecialtiesList region={region} filters={filters} onFilters={setFilters} onOpen={(specialty) => setView({ kind: 'hub', specialty })} />;
  }

  const { specialty } = view;
  const back = (
    <button type="button" className="back-link" onClick={() => setView(view.kind === 'hub' ? { kind: 'list' } : { kind: 'hub', specialty })}>
      <ArrowLeft size={12} color="currentColor" /> {view.kind === 'hub' ? 'Back to Specialties' : `Back to ${specialty.name}`}
    </button>
  );

  if (view.kind === 'hub') {
    const targets: [HubTarget, string, ReactNode][] = [
      ['doctors', 'Doctors', <Profile2User key="i" size={22} color="currentColor" variant="Bulk" />],
      ['services', 'Services', <Hospital key="i" size={22} color="currentColor" variant="Bulk" />],
      ['packages', 'Packages', <Box1 key="i" size={22} color="currentColor" variant="Bulk" />],
      ['offers', 'Offers', <TicketDiscount key="i" size={22} color="currentColor" variant="Bulk" />],
    ];
    return (
      <>
        {back}
        <div className="bento">
          <h2 className="hub-profile-title" dir="auto">{specialty.name}</h2>
          {specialty.arabicName && <div className="hub-card-sub" dir="rtl">{specialty.arabicName}</div>}
          <div className="page-sub">Explore related content</div>
          <div className="hub-tiles">
            {targets.map(([kind, label, icon]) => (
              <button key={kind} type="button" className="pick-card hub-tile" onClick={() => setView({ kind, specialty })}>
                <span className="hub-avatar">{icon}</span>
                <span className="pc-title">{label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Legacy "Details" (notes by business unit, general details, value proposition), shown straight away. */}
        <SpecialtyDetailsView region={region} specialty={specialty} />
      </>
    );
  }

  return (
    <>
      {back}
      <div className="ctx-bar">
          <span className="ctx-text">
            <span className="ctx-kind">{TARGET_LABEL[view.kind]}</span>
            <span className="ctx-sep" aria-hidden="true">·</span>
            <span className="ctx-name" dir="auto">{specialty.name}</span>
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenInSection(TARGET_SECTION[view.kind], specialty)}>
            {OPEN_LABEL[view.kind]}
            <ExportSquare size={14} color="currentColor" />
          </button>
      </div>
      {view.kind === 'doctors' && <DoctorsSection region={region} initialSpecialtyId={specialty.id} />}
      {view.kind === 'services' && <ServicesSection region={region} kind="services" initialSpecialtyId={specialty.id} />}
      {view.kind === 'packages' && <ServicesSection region={region} kind="packages" initialSpecialtyId={specialty.id} />}
      {view.kind === 'offers' && renderOffers(specialty)}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function SpecialtiesList({ region, filters, onFilters, onOpen }: { region: Region; filters: { bu: string; search: string }; onFilters: (filters: { bu: string; search: string }) => void; onOpen: (specialty: Specialty) => void }) {
  const [reload, setReload] = useState(0);
  // Only specialties with at least one visible doctor are listed, so the doctors data is needed too.
  const data = useAsyncData(`specialties:${region}:${reload}`, () => loadDoctorsData(region));
  const retry = () => {
    clearHubCache(`doctors:${region}`);
    clearHubCache('specialties');
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading specialties…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load specialties" message={data.error ?? ''} onRetry={retry} /></div>;

  const withDoctors = specialtyIdsWithDoctors(data.data);
  const doctorCounts = new Map<string, number>();
  for (const doctor of data.data.doctors) {
    const id = doctorSpecialtyId(data.data, doctor);
    doctorCounts.set(id, (doctorCounts.get(id) ?? 0) + 1);
  }
  const selectedBu = filters.bu.toLowerCase();
  const list = regionSpecialties([...data.data.specialties.values()], region).filter(
    (specialty) =>
      withDoctors.has(specialty.id) &&
      includesText([specialty.name, specialty.arabicName], filters.search) &&
      (!selectedBu || specialty.buNames.split(',').some((name) => name.trim().toLowerCase() === selectedBu)),
  );

  return (
    <>
      <FilterPanel summary={foundText(list.length, 'specialty', 'specialties')} canClear={Boolean(filters.bu || filters.search)} onClear={() => onFilters({ bu: '', search: '' })}>
        <FilterSelect label="Business Unit" allLabel="All Business Units" value={filters.bu} options={data.data.bus.map((bu) => ({ value: bu.name, label: bu.name }))} onChange={(bu) => onFilters({ ...filters, bu })} />
        <SearchField label="Search Specialty" value={filters.search} placeholder="Search in English or Arabic…" onChange={(search) => onFilters({ ...filters, search })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No specialties found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid sp-grid">
          {list.map((specialty) => {
            const count = doctorCounts.get(specialty.id) ?? 0;
            // Text-only card with a teal accent bar (user choice: no avatar, no BU tags — as the legacy card).
            return (
              <button key={specialty.id} type="button" className="ro-card hub-card sp-card" onClick={() => onOpen(specialty)}>
                <span className="sp-body">
                  <span className="sp-name" dir="auto">{specialty.name}</span>
                  {specialty.arabicName && <span className="sp-ar" dir="rtl">{specialty.arabicName}</span>}
                  <span className="sp-meta">
                    <span className="sbadge sbadge-green">
                      {count} {count === 1 ? 'doctor' : 'doctors'}
                    </span>
                  </span>
                </span>
                <ArrowRight2 className="sp-go" size={18} color="currentColor" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function SpecialtyDetailsView({ region, specialty }: { region: Region; specialty: Specialty }) {
  const [reload, setReload] = useState(0);
  const details = useAsyncData(`specialty-details:${region}:${specialty.id}:${reload}`, () => loadSpecialtyDetails(region, specialty.id));

  if (details.loading) return <div className="bento"><HubLoading label="Loading details…" /></div>;
  if (details.error || !details.data) return <div className="bento"><HubError title="Couldn’t load details" message={details.error ?? ''} onRetry={() => setReload((count) => count + 1)} /></div>;

  const { notes, general } = details.data;
  const byBu = new Map<string, typeof notes>();
  for (const note of notes) byBu.set(note.buName, [...(byBu.get(note.buName) ?? []), note]);

  if (!notes.length && !general.length && !specialty.valueProposition) {
    return <div className="bento"><HubEmpty title="No details yet" sub="This specialty has no notes, general details or value proposition." /></div>;
  }

  return (
    <>
      {byBu.size > 0 && (
        <div className="bento">
          <div className="sub-hdr">Important Notes – ملاحظات هامة</div>
          {[...byBu.entries()].map(([buName, buNotes]) => (
            <details key={buName} className="ro-card hub-fold" open={byBu.size <= 3}>
              <summary className="ro-title">{buName}</summary>
              {buNotes.map((note, index) => (
                <div key={index} className="hub-note">
                  {note.topic && <strong dir="auto">{note.topic}</strong>}
                  {note.details && <RichBlock value={note.details} />}
                </div>
              ))}
            </details>
          ))}
        </div>
      )}
      {general.length > 0 && (
        <div className="bento">
          <div className="sub-hdr">General Details</div>
          {general.map((item, index) => (
            <div key={index} className="ro-card">
              {item.subSpecialty && <div className="ro-title" dir="auto">{item.subSpecialty}</div>}
              <RichBlock value={item.details} />
            </div>
          ))}
        </div>
      )}
      {specialty.valueProposition && (
        <div className="bento">
          <div className="sub-hdr">Value Proposition</div>
          <RichBlock value={specialty.valueProposition} />
        </div>
      )}
    </>
  );
}
