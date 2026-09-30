import { useEffect, useState } from 'react';
import { ArrowLeft, DocumentText, Profile2User } from 'iconsax-react';
import type { Region } from '../../app/region';
import { distinctClinics, loadProcedureClinics } from '../../data/hub/clinics';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { logPageUsage } from '../../data/usageLog';
import { DoctorsSection } from './DoctorsSection';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, SearchField } from './HubCommon';

/** Legacy "Procedure Clinics" (Egypt): clinic list → clinic hub (Doctors / Details). */

type View = { kind: 'list' } | { kind: 'hub' | 'doctors' | 'details'; clinic: string };

/** Legacy screen ids of the clinic views, for the usage log. */
const VIEW_SCREENS: Record<View['kind'], string | null> = { list: null, hub: 'clinicHubScreen', doctors: 'clinicDoctorsScreen', details: 'clinicDetailsScreen' };

export function ProcedureClinicsSection({ region, initialClinic }: { region: Region; initialClinic?: string }) {
  const [view, setView] = useState<View>(initialClinic ? { kind: 'hub', clinic: initialClinic } : { kind: 'list' });
  const screen = VIEW_SCREENS[view.kind];
  const shownClinic = view.kind === 'list' ? '' : view.clinic;
  useEffect(() => {
    if (screen) logPageUsage(screen);
  }, [screen, shownClinic]);
  const [filters, setFilters] = useState({ bu: '', search: '' });
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`procedure-clinics:${region}:${reload}`, () => loadProcedureClinics(region));
  const retry = () => {
    clearHubCache(`procedure-clinics:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading procedure clinics…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load procedure clinics" message={data.error ?? ''} onRetry={retry} /></div>;
  const { records, bus } = data.data;

  if (view.kind === 'list') {
    const clinics = distinctClinics(records.filter((record) => (!filters.bu || record.buId === filters.bu) && includesText([record.name, record.nameAr], filters.search)));
    return (
      <>
        <FilterPanel summary={foundText(clinics.length, 'clinic')} canClear={Boolean(filters.bu || filters.search)} onClear={() => setFilters({ bu: '', search: '' })}>
          <FilterSelect label="Business Unit" allLabel="All Business Units" value={filters.bu} options={bus.map((bu) => ({ value: bu.id, label: bu.name }))} onChange={(bu) => setFilters({ ...filters, bu })} />
          <SearchField label="Search Clinic" value={filters.search} placeholder="Search clinic (Arabic / English)" onChange={(search) => setFilters({ ...filters, search })} />
        </FilterPanel>
        {clinics.length === 0 ? (
          <div className="bento"><HubEmpty title="No procedure clinics found" sub="Try adjusting your filters" /></div>
        ) : (
          <div className="hub-grid hub-grid-sm">
            {clinics.map((clinic) => (
              <button key={clinic.name || clinic.nameAr} type="button" className="ro-card hub-card hub-card-btn" onClick={() => setView({ kind: 'hub', clinic: clinic.name || clinic.nameAr })}>
                <span className="hub-card-title" dir="auto">{clinic.name || clinic.nameAr}</span>
                {clinic.name && clinic.nameAr && <span className="hub-card-sub hub-ar" dir="rtl">{clinic.nameAr}</span>}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  const { clinic } = view;
  const back = (
    <button type="button" className="back-link" onClick={() => setView(view.kind === 'hub' ? { kind: 'list' } : { kind: 'hub', clinic })}>
      <ArrowLeft size={12} color="currentColor" /> {view.kind === 'hub' ? 'Back to Procedure Clinics' : `Back to ${clinic}`}
    </button>
  );

  if (view.kind === 'hub') {
    return (
      <>
        {back}
        <div className="bento">
          <h2 className="hub-profile-title" dir="auto">{clinic}</h2>
          <div className="hub-tiles">
            <button type="button" className="pick-card hub-tile" onClick={() => setView({ kind: 'doctors', clinic })}>
              <span className="hub-avatar"><Profile2User size={22} color="currentColor" variant="Bulk" /></span>
              <span className="pc-title">Doctors</span>
            </button>
            <button type="button" className="pick-card hub-tile" onClick={() => setView({ kind: 'details', clinic })}>
              <span className="hub-avatar"><DocumentText size={22} color="currentColor" variant="Bulk" /></span>
              <span className="pc-title">Details</span>
            </button>
          </div>
        </div>
      </>
    );
  }

  if (view.kind === 'doctors') {
    return (
      <>
        {back}
        <div className="ctx-bar">
          <span className="ctx-text">
            <span className="ctx-kind">Doctors</span>
            <span className="ctx-sep" aria-hidden="true">·</span>
            <span className="ctx-name" dir="auto">{clinic}</span>
          </span>
        </div>
        <DoctorsSection region={region} clinicName={clinic} onOpenClinic={(name) => setView({ kind: 'hub', clinic: name })} />
      </>
    );
  }

  const details = records.filter((record) => record.name === clinic || record.nameAr === clinic);
  return (
    <>
      {back}
      <div className="sub-hdr">{clinic} · Details</div>
      {details.every((record) => !record.details) ? (
        <div className="bento"><HubEmpty title="No details yet" sub="This clinic has no details for any business unit." /></div>
      ) : (
        <div className="bento">
          {details.map((record, index) => (
            <details key={index} className="ro-card hub-fold">
              <summary className="ro-title">{record.buName || 'N/A'}</summary>
              <RichBlock value={record.details} arabic points />
            </details>
          ))}
        </div>
      )}
    </>
  );
}
