import { useState } from 'react';
import { MedalStar } from 'iconsax-react';
import type { Region } from '../../app/region';
import { loadCenters, normalizeSearch, type CenterOfExcellence } from '../../data/hub/centers';
import { clearHubCache, foundText } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, RichValue, SearchField } from './HubCommon';

/** Legacy "Centers of Excellence": foldable clinic cards (one per row) filtered by sub-specialty text. */
export function CoeSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ sub: '', search: '' });
  const data = useAsyncData(`coe:${region}:${reload}`, () => loadCenters(region));
  const retry = () => {
    clearHubCache(`coe:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading centers of excellence…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load centers of excellence" message={data.error ?? ''} onRetry={retry} /></div>;

  const search = normalizeSearch(filters.search);
  const sub = filters.sub.toLowerCase();
  const list = data.data.centers.filter((center) => {
    const text = normalizeSearch(center.subSpecialties);
    return (!search || text.includes(search)) && (!sub || text.includes(sub));
  });

  return (
    <>
      <FilterPanel summary={foundText(list.length, 'center')} canClear={Boolean(filters.sub || filters.search)} onClear={() => setFilters({ sub: '', search: '' })}>
        <FilterSelect label="Sub-Specialty" allLabel="All Sub-Specialties" value={filters.sub} options={data.data.subSpecialtyNames.map((name) => ({ value: name, label: name }))} onChange={(value) => setFilters({ ...filters, sub: value })} />
        <SearchField label="Search by Specialty" value={filters.search} placeholder="Search by sub-specialty…" onChange={(value) => setFilters({ ...filters, search: value })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No Centers of Excellence found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-list">
          {list.map((center) => (
            <CenterCard key={center.id} center={center} region={region} />
          ))}
        </div>
      )}
    </>
  );
}

function CenterCard({ center, region }: { center: CenterOfExcellence; region: Region }) {
  // Only fields and blocks that have data are shown (user request).
  const fields = [
    { label: 'Business Unit', value: center.buName },
    { label: 'Clinical Leader', value: center.leader },
    { label: 'Coordinator', value: center.coordinator },
    { label: 'Sub-Specialty', value: center.subSpecialties },
  ].filter((field) => field.value.trim());
  const blocks = [
    { title: 'Members', value: center.members, arabic: false, points: false },
    { title: 'Arabic Script', value: center.arabicScript, arabic: true, points: true },
    { title: 'Value Proposition', value: region === 'EGY' ? center.valueProposition : '', arabic: false, points: true },
    { title: 'Clinic Booking Process', value: region === 'EGY' ? center.englishScript : '', arabic: false, points: true },
  ].filter((block) => block.value.trim());

  return (
    <details className="ro-card hub-card hub-fold coe-card">
      <summary>
        <span className="coe-icon" aria-hidden="true">
          <MedalStar size={24} color="currentColor" variant="Bulk" />
        </span>
        <span className="coe-head">
          <span className="coe-name" dir="auto">{center.clinicName || 'N/A'}</span>
          {fields.length > 0 && (
            <dl className="coe-fields coe-fields-pills">
              {fields.map((field) => (
                <div key={field.label} className="coe-field">
                  <dt>{field.label}</dt>
                  <dd dir="auto">
                    <RichValue value={field.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </span>
      </summary>
      {blocks.length > 0 ? (
        <div className="coe-blocks">
          {blocks.map((block) => (
            <section key={block.title} className="coe-block">
              <div className="coe-block-title">{block.title}</div>
              <RichBlock value={block.value} arabic={block.arabic} points={block.points} />
            </section>
          ))}
        </div>
      ) : (
        <p className="hub-muted">No more details for this center.</p>
      )}
    </details>
  );
}
