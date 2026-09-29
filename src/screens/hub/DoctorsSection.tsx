import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Refresh2, UserSquare } from 'iconsax-react';
import { DOCTOR_COLUMN_CHOICES, readDoctorColumns, writeDoctorColumns } from '../../app/preferences';
import { REGION_CURRENCY, type Region } from '../../app/region';
import { clearHubCache, includesText, foundText } from '../../data/hub/common';
import {
  activeExceptions,
  ALEX_BU_NAMES,
  clinicsForDoctor,
  CONTRACT_TYPES,
  doctorHasClinic,
  doctorSpecialtyId,
  hasFirstPriority,
  loadDoctorsData,
  specialtyIdsWithDoctors,
  type Doctor,
  type DoctorException,
  type DoctorsData,
} from '../../data/hub/doctors';
import { useAsyncData } from '../../data/useAsyncData';
import { CardFields, FilterMultiSelect, FilterPanel, FilterSelect, HubEmpty, HubError, HubLoading, RichBlock, RichValue, SearchField, type MultiOption, type Option } from './HubCommon';

/**
 * Doctors Directory — the legacy web resource's first screen: filterable doctor cards
 * (fees per business unit, first priority / star, exceptions) and the doctor profile.
 */

interface DoctorFilters {
  bus: string[];
  specialty: string;
  subSpecialty: string;
  degree: string;
  contract: string;
  star: string;
  firstPriority: string;
  exclusiveness: string;
  search: string;
}

const NO_FILTERS: DoctorFilters = {
  bus: [],
  specialty: '',
  subSpecialty: '',
  degree: '',
  contract: '',
  star: '',
  firstPriority: '',
  exclusiveness: '',
  search: '',
};
const PAGE_SIZE = 60;
/** Widest a doctor card gets (px), so wide screens don't stretch the cards. */
const CARD_MAX = 500;

/**
 * `initialSpecialtyId` pre-selects a specialty (opened from a specialty hub); `clinicName` limits the
 * directory to one procedure clinic's doctors (opened from a clinic hub).
 */
export function DoctorsSection({ region, initialSpecialtyId = '', clinicName }: { region: Region; initialSpecialtyId?: string; clinicName?: string }) {
  const [reload, setReload] = useState(0);
  const result = useAsyncData(`doctors:${region}:${reload}`, () => loadDoctorsData(region));
  const [filters, setFilters] = useState<DoctorFilters>({
    ...NO_FILTERS,
    specialty: initialSpecialtyId,
  });
  const [profileId, setProfileId] = useState<string | null>(null);

  const refresh = () => {
    clearHubCache(`doctors:${region}`);
    clearHubCache(`bu:${region}`);
    setReload((count) => count + 1);
  };

  if (result.loading)
    return (
      <div className="bento">
        <HubLoading label="Loading doctors and filters…" />
      </div>
    );
  if (result.error || !result.data) {
    return (
      <div className="bento">
        <HubError title="Couldn’t load doctors" message={result.error ?? ''} onRetry={refresh} />
      </div>
    );
  }

  const all = result.data;
  const data = clinicName
    ? {
        ...all,
        doctors: all.doctors.filter((doctor) => doctorHasClinic(all, doctor, clinicName)),
      }
    : all;
  const profile = profileId ? data.doctors.find((doctor) => doctor.id === profileId) : undefined;
  if (profile) return <DoctorProfile data={data} doctor={profile} onBack={() => setProfileId(null)} />;

  return <DoctorsDirectory data={data} filters={filters} onFilters={setFilters} onOpenProfile={setProfileId} onRefresh={refresh} />;
}

// ---------------------------------------------------------------------------------------------
// Directory (filters + cards)
// ---------------------------------------------------------------------------------------------

function DoctorsDirectory({
  data,
  filters,
  onFilters,
  onOpenProfile,
  onRefresh,
}: {
  data: DoctorsData;
  filters: DoctorFilters;
  onFilters: (filters: DoctorFilters) => void;
  onOpenProfile: (id: string) => void;
  onRefresh: () => void;
}) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const [columns, setColumnsState] = useState(readDoctorColumns);
  const setColumns = (value: number) => {
    setColumnsState(value);
    writeDoctorColumns(value);
  };
  const isEgy = data.region === 'EGY';
  const set = <K extends keyof DoctorFilters>(key: K, value: DoctorFilters[K]) => {
    setShown(PAGE_SIZE);
    onFilters({
      ...filters,
      [key]: value,
      ...(key === 'specialty' ? { subSpecialty: '' } : {}),
    });
  };

  const options = useMemo(() => filterOptions(data), [data]);
  const subSpecialtyOptions = useMemo(() => subSpecialtiesFor(data, filters.specialty), [data, filters.specialty]);
  const doctors = useMemo(() => filterDoctors(data, filters), [data, filters]);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  return (
    <>
      <FilterPanel summary={foundText(doctors.length, 'doctor')} canClear={hasFilters} onClear={() => onFilters(NO_FILTERS)}>
        <FilterMultiSelect label="Business Unit" allLabel="All Business Units" options={options.bus} selected={filters.bus} onChange={(value) => set('bus', value)} />
        <FilterSelect label="Specialty" allLabel="All Specialties" value={filters.specialty} options={options.specialties} onChange={(value) => set('specialty', value)} />
        <FilterSelect label="Sub-Specialty" allLabel="All Sub-Specialties" value={filters.subSpecialty} options={subSpecialtyOptions} onChange={(value) => set('subSpecialty', value)} />
        <FilterSelect label="Degree" allLabel="All Degrees" value={filters.degree} options={options.degrees} onChange={(value) => set('degree', value)} />
        {isEgy ? (
          <>
            <FilterSelect label="First Priority" allLabel="All Doctors" value={filters.firstPriority} options={YES_NO} onChange={(value) => set('firstPriority', value)} />
            <FilterSelect label="Exclusiveness" allLabel="All" value={filters.exclusiveness} options={EXCLUSIVENESS} onChange={(value) => set('exclusiveness', value)} />
          </>
        ) : (
          <>
            <FilterSelect label="Contract Type" allLabel="All Contract Types" value={filters.contract} options={CONTRACT_OPTIONS} onChange={(value) => set('contract', value)} />
            <FilterSelect label="Star Doctor" allLabel="All Doctors" value={filters.star} options={STAR_OPTIONS} onChange={(value) => set('star', value)} />
          </>
        )}
        <SearchField label="Search Doctors" value={filters.search} placeholder="Search by name (English or Arabic)…" onChange={(value) => set('search', value)} />
        <button type="button" className="btn btn-ghost btn-sm hub-refresh" onClick={onRefresh} title="Reload doctors from Dataverse">
          <Refresh2 size={14} color="currentColor" /> Refresh
        </button>
      </FilterPanel>

      {doctors.length === 0 ? (
        <div className="bento">
          <HubEmpty title="No doctors found" sub="Try adjusting your filters or search criteria" />
        </div>
      ) : (
        <>
          {/* Cards are capped at CARD_MAX; the wrapper keeps the toolbar aligned with them. */}
          <div className="hub-doctor-area" style={{ maxWidth: columns * CARD_MAX + (columns - 1) * 14 }}>
            <div className="hub-toolbar">
              <span className="field-lbl">Doctors per row</span>
              <div className="seg-group" role="group" aria-label="Doctors per row">
                {DOCTOR_COLUMN_CHOICES.map((value) => (
                  <button key={value} type="button" className={`seg-btn${columns === value ? ' active' : ''}`} aria-pressed={columns === value} onClick={() => setColumns(value)}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="hub-grid hub-grid-cols" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {doctors.slice(0, shown).map((doctor) => (
                <DoctorCard key={doctor.id} data={data} doctor={doctor} onOpenProfile={() => onOpenProfile(doctor.id)} />
              ))}
            </div>
            {shown < doctors.length && (
              <div className="hub-more">
                <button type="button" className="btn btn-outline" onClick={() => setShown((count) => count + PAGE_SIZE)}>
                  Show more ({doctors.length - shown} remaining)
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

const YES_NO: Option[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const EXCLUSIVENESS: Option[] = [
  { value: '1', label: 'Exclusive' },
  { value: '0', label: 'Not Exclusive' },
];
const CONTRACT_OPTIONS: Option[] = Object.entries(CONTRACT_TYPES).map(([value, label]) => ({ value, label }));
const STAR_OPTIONS: Option[] = [
  { value: '3', label: 'First Priority' },
  { value: '1', label: 'Yes' },
  { value: '2', label: 'No' },
];

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label);

function filterOptions(data: DoctorsData) {
  // Business units: Egypt adds an "Alex" entry that selects the Alex hospitals together.
  const bus: MultiOption[] = [];
  const isAlexChild = (name: string) => data.region === 'EGY' && ALEX_BU_NAMES.includes(name.trim().toLowerCase());
  if (data.region === 'EGY') {
    const alexIds = data.bus.filter((bu) => isAlexChild(bu.name)).map((bu) => bu.id);
    if (alexIds.length) bus.push({ value: '__alex', label: 'Alex', values: alexIds });
  }
  for (const bu of data.bus) {
    if (data.region === 'EGY' && bu.name.trim().toLowerCase() === 'alex') continue;
    bus.push({ value: bu.id, label: bu.name, child: isAlexChild(bu.name) });
  }

  const regionCode = data.region === 'EGY' ? 983080000 : 983080001;
  const withDoctors = specialtyIdsWithDoctors(data);
  const specialties = [...data.specialties.values()]
    .filter((specialty) => (specialty.region === null || specialty.region === regionCode) && withDoctors.has(specialty.id))
    .map((specialty) => ({ value: specialty.id, label: specialty.name }))
    .sort(byLabel);
  const degrees = [...data.degrees.values()].map((degree) => ({ value: degree.id, label: degree.name })).sort(byLabel);
  return { bus, specialties, degrees };
}

/** Sub-specialties of the doctors in a specialty (legacy populateSubSpecialties). */
function subSpecialtiesFor(data: DoctorsData, specialtyId: string): Option[] {
  const names = new Set<string>();
  if (specialtyId) {
    for (const doctor of data.doctors) {
      if (doctor.subSpecialtyName && doctorSpecialtyId(data, doctor) === specialtyId) names.add(doctor.subSpecialtyName);
    }
  } else {
    for (const sub of data.subSpecialties.values()) if (sub.name) names.add(sub.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
}

/** The legacy applyFilters rules. */
function filterDoctors(data: DoctorsData, filters: DoctorFilters): Doctor[] {
  return data.doctors.filter((doctor) => {
    const fees = data.feesByDoctor.get(doctor.id) ?? [];
    if (filters.bus.length && !fees.some((fee) => filters.bus.includes(fee.buId))) return false;
    if (filters.specialty && doctorSpecialtyId(data, doctor) !== filters.specialty) return false;
    if (filters.subSpecialty && doctor.subSpecialtyName !== filters.subSpecialty) return false;
    if (filters.degree && doctor.degreeId !== filters.degree) return false;
    if (data.region === 'EGY') {
      if (filters.firstPriority && (filters.firstPriority === 'yes') !== hasFirstPriority(data, doctor.id)) return false;
      if (filters.exclusiveness && doctor.exclusiveness !== Number(filters.exclusiveness)) return false;
    } else {
      if (filters.contract && String(doctor.contractType ?? '') !== filters.contract) return false;
      if (filters.star && String(doctor.starDoctor ?? '') !== filters.star) return false;
    }
    return includesText([doctor.title, doctor.nameAr, doctor.nameEn], filters.search);
  });
}

// ---------------------------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------------------------

const formatDate = (date: Date) => date.toLocaleDateString();

/** The legacy page's doctor photo (same image for every doctor). */
const DOCTOR_PHOTO_URL = 'https://ksa-portal.andalusiagroup.net/servhubdoc.png';

/** Round doctor photo; falls back to the icon if the image can't load (e.g. blocked host). */
function DoctorPhoto({ large }: { large?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={`hub-avatar hub-doctor-photo${large ? ' large' : ''}`} aria-hidden="true">
        <UserSquare size={large ? 40 : 34} color="currentColor" variant="Bulk" />
      </div>
    );
  }
  return <img className={`hub-doctor-photo${large ? ' large' : ''}`} src={DOCTOR_PHOTO_URL} alt="" onError={() => setFailed(true)} />;
}

function DoctorBadges({ data, doctor }: { data: DoctorsData; doctor: Doctor }) {
  const firstPriority = data.region === 'EGY' ? hasFirstPriority(data, doctor.id) : doctor.starDoctor === 3;
  const star = data.region === 'KSA' && doctor.starDoctor === 1;
  return (
    <>
      {firstPriority && (
        <span title="First Priority" aria-label="First Priority">
          🥇
        </span>
      )}
      {star && (
        <span title="Star Doctor" aria-label="Star Doctor">
          ⭐
        </span>
      )}
      {doctor.exclusiveness === 1 && (
        <span title="Exclusive" aria-label="Exclusive">
          ⭐
        </span>
      )}
    </>
  );
}

function ExceptionFlag({ exceptions }: { exceptions: DoctorException[] }) {
  const soonest = new Date(Math.min(...exceptions.map((item) => item.to.getTime())));
  return (
    <div className="hub-flag" tabIndex={0} aria-label={`${exceptions.length} active exception(s)`}>
      🚩 <span className="hub-flag-date">until {formatDate(soonest)}</span>
      <div className="hub-flag-tip" role="tooltip">
        {exceptions.map((item, index) => (
          <div key={index} className="hub-flag-item">
            <div className="hub-flag-title" dir="auto">
              {item.type || 'Exception'}
            </div>
            {item.reason && <div dir="auto">{item.reason}</div>}
            <div className="hub-flag-dates">
              {formatDate(item.from)} → {formatDate(item.to)} {item.bu && `(${item.bu})`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Doctor card ("Split" design, chosen by the user): photo + names block, labelled fields, fee table. */
function DoctorCard({ data, doctor, onOpenProfile }: { data: DoctorsData; doctor: Doctor; onOpenProfile: () => void }) {
  const exceptions = activeExceptions(data, doctor.id);
  const busById = new Map(data.bus.map((bu) => [bu.id, bu.name]));
  const currency = REGION_CURRENCY[data.region];
  const clinics = data.region === 'EGY' ? clinicsForDoctor(data, doctor) : [];
  // Every legacy field, labelled, in the legacy order.
  const fields = [
    { label: 'Specialty', value: data.specialties.get(doctorSpecialtyId(data, doctor))?.name || doctor.specialtyLabel },
    { label: 'Sub-Specialty', value: data.subSpecialties.get(doctor.subSpecialtyId)?.name || doctor.subSpecialtyName },
    { label: 'Degree', value: data.degrees.get(doctor.degreeId)?.name || doctor.degreeLabel },
    ...(data.region === 'EGY' && doctor.examinationAge ? [{ label: 'Examination Age', value: doctor.examinationAge }] : []),
    ...(clinics.length ? [{ label: 'Clinics', value: clinics.map((clinic) => clinic.name).join(', ') }] : []),
  ];
  const fees = data.feesByDoctor.get(doctor.id) ?? [];

  return (
    <article className="ro-card hub-card dcx-card spl-card">
      <div className="spl-card-inner">
        <aside className="spl-side">
          <DoctorPhoto />
          <h3 className="dcx-name" dir="auto">
            {doctor.nameEn || 'N/A'} <DoctorBadges data={data} doctor={doctor} />
          </h3>
          <div className="dcx-user" dir="auto">
            {doctor.title || 'N/A'}
          </div>
          <div className="dcx-ar" dir="rtl">
            {doctor.nameAr || 'غير متوفر'}
          </div>
          {exceptions.length > 0 && <ExceptionFlag exceptions={exceptions} />}
        </aside>
        <div className="spl-main">
          <CardFields fields={fields} />
          {fees.length ? (
            <table className="dcx-fee-table">
              <thead>
                <tr>
                  <th>Business Unit</th>
                  <th>Consultation Fee</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((fee, index) => (
                  <tr key={index} className={fee.firstPriority ? 'first' : undefined}>
                    <td>
                      {fee.firstPriority && <span title="First Priority">🥇 </span>}
                      {busById.get(fee.buId) ?? 'N/A'}
                    </td>
                    <td>{fee.original ? `${fee.original} ${currency}` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="hub-muted">No consultation fees</p>
          )}
          <button type="button" className="btn btn-primary btn-block dcx-action" onClick={onOpenProfile}>
            <UserSquare size={16} color="currentColor" /> Visit Doctor Profile
          </button>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------------------------

/** Scope / qualifications text; language headings only when both languages are present. */
function LanguageText({ english, arabic, empty }: { english: string; arabic: string; empty: string }) {
  if (!english && !arabic) return <p className="hub-muted">{empty}</p>;
  if (!english || !arabic) return <RichBlock value={english || arabic} arabic={!english} />;
  return (
    <div className="hub-two-lang">
      <div>
        <div className="pf-lang">English</div>
        <RichBlock value={english} />
      </div>
      <div>
        <div className="pf-lang" dir="rtl">
          العربية
        </div>
        <RichBlock value={arabic} arabic />
      </div>
    </div>
  );
}

type Fee = DoctorsData['feesByDoctor'] extends Map<string, (infer F)[]> ? F : never;

/** Consultation fees: one row per business unit, one column per fee type that has any value. */
function FeesTable({ fees, busById, currency }: { fees: Fee[]; busById: Map<string, string>; currency: string }) {
  if (!fees.length) return <p className="hub-muted">No consultation fees information available</p>;
  const columns = (
    [
      ['original', 'Original'],
      ['affiliate', 'Affiliate'],
      ['contract', 'Contract'],
      ['walkIn', 'Walk-in'],
    ] as const
  ).filter(([key]) => fees.some((fee) => fee[key]));
  return (
    <div className="pf-table-wrap">
      <table className="dcx-fee-table pf-fee-table">
        <thead>
          <tr>
            <th>Business Unit</th>
            {columns.map(([key, label]) => (
              <th key={key}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fees.map((fee, index) => (
            <tr key={index} className={fee.firstPriority ? 'first' : undefined}>
              <td>
                {fee.firstPriority && <span title="First Priority">🥇 </span>}
                {busById.get(fee.buId) ?? 'N/A'}
              </td>
              {columns.map(([key]) => (
                <td key={key}>{fee[key] ? `${fee[key]} ${currency}` : '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DoctorProfile({ data, doctor, onBack }: { data: DoctorsData; doctor: Doctor; onBack: () => void }) {
  const fees = data.feesByDoctor.get(doctor.id) ?? [];
  const busById = new Map(data.bus.map((bu) => [bu.id, bu.name]));
  const buIds = [...new Set(fees.map((fee) => fee.buId))];
  const exceptions = activeExceptions(data, doctor.id);
  const currency = REGION_CURRENCY[data.region];
  // Every legacy "Basic Information" field, labelled.
  const facts = [
    { label: 'Specialty', value: data.specialties.get(doctorSpecialtyId(data, doctor))?.name || doctor.specialtyLabel },
    { label: 'Sub-Specialty', value: data.subSpecialties.get(doctor.subSpecialtyId)?.name || doctor.subSpecialtyName },
    { label: 'Degree', value: data.degrees.get(doctor.degreeId)?.name || doctor.degreeLabel },
    { label: 'Nationality', value: data.nationalities.get(doctor.nationalityId)?.name || doctor.nationalityLabel },
    ...(data.region === 'KSA' ? [{ label: 'Contract Type', value: doctor.contractType !== null ? (CONTRACT_TYPES[doctor.contractType] ?? '') : '' }] : []),
    { label: 'Examination Age', value: doctor.examinationAge },
    { label: 'Insurance Issues', value: doctor.insuranceIssues },
    { label: 'Staff EX Limitation', value: doctor.staffExLimitation },
  ];

  const identity = (large: boolean) => (
    <>
      <DoctorPhoto large={large} />
      <div className="pf-names">
        <h2 className="pf-name" dir="auto">
          {doctor.nameEn || doctor.title || 'N/A'} <DoctorBadges data={data} doctor={doctor} />
        </h2>
        <div className="pf-user" dir="auto">
          {doctor.title || 'N/A'}
        </div>
        <div className="pf-ar" dir="rtl">
          {doctor.nameAr || 'غير متوفر'}
        </div>
      </div>
    </>
  );
  const buChips = buIds.length ? (
    <div className="hub-badges">
      {buIds.map((id) => (
        <span key={id} className="sbadge sbadge-green">
          {fees.some((fee) => fee.buId === id && fee.firstPriority) && '🥇 '}
          {busById.get(id) ?? 'N/A'}
        </span>
      ))}
    </div>
  ) : (
    <p className="hub-muted">No business units found</p>
  );
  const exceptionList = exceptions.length > 0 && (
    <div className="pf-exceptions">
      {exceptions.map((item, index) => (
        <div key={index} className="hub-exception" dir="auto">
          <strong>🚩 {item.type || 'Exception'}</strong>
          {item.reason && ` — ${item.reason}`} · {formatDate(item.from)} → {formatDate(item.to)} {item.bu && `(${item.bu})`}
        </div>
      ))}
    </div>
  );
  const factTiles = (
    <dl className="svc-grid pf-facts">
      {facts.map((fact) => (
        <div key={fact.label} className="svc-f">
          <dt>{fact.label}</dt>
          <dd dir="auto">{fact.value ? <RichValue value={fact.value} /> : 'N/A'}</dd>
        </div>
      ))}
    </dl>
  );
  const section = (title: string, body: ReactNode) => (
    <section className="bento pf-section">
      <div className="pf-title">{title}</div>
      {body}
    </section>
  );
  const scope = <LanguageText english={doctor.scopeEn} arabic={doctor.scopeAr} empty="No scope of service information available" />;
  const qualifications = <LanguageText english={doctor.qualificationsEn} arabic={doctor.qualificationsAr} empty="No qualifications information available" />;
  const notes = doctor.notes ? <RichBlock value={doctor.notes} /> : <p className="hub-muted">No doctor notes</p>;
  const feesTable = <FeesTable fees={fees} busById={busById} currency={currency} />;

  // "Sidebar" layout (user choice 2026-09-29): identity, BUs and fees in a sticky side card.
  return (
    <>
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={12} color="currentColor" /> Back to Doctors
      </button>
      <div className="pf-sidebar-layout">
        <aside className="bento pf-aside">
          <div className="pf-identity pf-identity-center">{identity(true)}</div>
          {exceptionList}
          <div className="pf-title">Business Units</div>
          {buChips}
          <div className="pf-title">Consultation Fees</div>
          {feesTable}
        </aside>
        <div className="pf-main">
          {section('Basic Information', factTiles)}
          {section('Scope of Service', scope)}
          {section('Qualifications & Experience', qualifications)}
          {doctor.notes && section('Doctor Notes', notes)}
        </div>
      </div>
    </>
  );
}
