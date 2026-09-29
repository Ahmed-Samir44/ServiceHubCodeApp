import { useState } from 'react';
import { REGION_CURRENCY, type Region } from '../../app/region';
import { clearHubCache, foundText, includesText } from '../../data/hub/common';
import { loadPrograms, PROGRAM_LEVELS, type Program } from '../../data/hub/programs';
import { useAsyncData } from '../../data/useAsyncData';
import { FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, InfoRow, RichBlock, SearchField } from './HubCommon';

/** Legacy "Programs": foldable program cards filtered by BU, specialty, level and name. */

interface ProgramFilters {
  bu: string;
  specialty: string;
  level: string;
  search: string;
}

const NO_FILTERS: ProgramFilters = { bu: '', specialty: '', level: '', search: '' };
const LEVEL_OPTIONS = Object.entries(PROGRAM_LEVELS).map(([value, label]) => ({ value, label }));

export function ProgramsSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState<ProgramFilters>(NO_FILTERS);
  const data = useAsyncData(`programs:${region}:${reload}`, () => loadPrograms(region));
  const retry = () => {
    clearHubCache(`programs:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading programs…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load programs" message={data.error ?? ''} onRetry={retry} /></div>;

  const set = <K extends keyof ProgramFilters>(key: K, value: ProgramFilters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const list = data.data.programs.filter(
    (program) =>
      (!filters.bu || program.buId === filters.bu) &&
      (!filters.specialty || program.specialtyId === filters.specialty) &&
      (!filters.level || program.level === Number(filters.level)) &&
      includesText([program.programName, program.name], filters.search),
  );

  return (
    <>
      <FilterPanel summary={foundText(list.length, 'program')} canClear={JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)} onClear={() => setFilters(NO_FILTERS)}>
        <FilterSelect label="Business Unit" allLabel="All" value={filters.bu} options={data.data.bus.map((bu) => ({ value: bu.id, label: bu.name }))} onChange={(value) => set('bu', value)} />
        <FilterSelect label="Specialty" allLabel="All" value={filters.specialty} options={data.data.specialties.map((item) => ({ value: item.id, label: item.name }))} onChange={(value) => set('specialty', value)} />
        <FilterSelect label="Program Level" allLabel="All" value={filters.level} options={LEVEL_OPTIONS} onChange={(value) => set('level', value)} />
        <SearchField label="Search Program" value={filters.search} placeholder="Search by program name…" onChange={(value) => set('search', value)} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No programs found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-list">
          {list.map((program) => (
            <ProgramCard key={program.id} program={program} currency={REGION_CURRENCY[region]} />
          ))}
        </div>
      )}
    </>
  );
}

function ProgramCard({ program, currency }: { program: Program; currency: string }) {
  const level = program.level !== null ? PROGRAM_LEVELS[program.level] : undefined;
  return (
    <details className="ro-card hub-fold hub-fold-card">
      <summary>
        <span className="hub-card-names">
          <span className="hub-card-title" dir="auto">{program.name || '—'}</span>
          <span className="hub-card-meta" dir="auto">
            Specialty: {program.specialtyName || '—'} | BU: {program.buName || '—'} | Level: {level || '—'}
          </span>
        </span>
        <span className="hub-prices">
          {program.priceBefore && <span className="hub-price-before">{program.priceBefore} {currency}</span>}
          {program.priceAfter && <span className="hub-price">{program.priceAfter} {currency}</span>}
        </span>
      </summary>
      <div className="kv-grid">
        <InfoRow label="Program Name">{program.programName || '—'}</InfoRow>
        <InfoRow label="No. of Services">{program.servicesCount || '—'}</InfoRow>
      </div>
      <div className="hub-subblock">
        <div className="field-lbl">Description</div>
        {program.description ? <RichBlock value={program.description} /> : <p className="hub-muted">—</p>}
      </div>
      <div className="hub-subblock">
        <div className="field-lbl">Services Included</div>
        {program.servicesIncluded ? <RichBlock value={program.servicesIncluded} /> : <p className="hub-muted">—</p>}
      </div>
    </details>
  );
}
