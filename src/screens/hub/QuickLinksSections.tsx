import { useState } from 'react';
import type { Region } from '../../app/region';
import { foundText, includesText } from '../../data/hub/common';
import {
  choicesOf,
  loadBookingPolicies,
  loadCrmDictionary,
  loadInsurance,
  loadQaTips,
  loadWorkingHours,
  type BookingPolicy,
  type CrmEntry,
  type InsuranceCompany,
  type QaTip,
  type WorkingHours,
} from '../../data/hub/quickLinks';
import { FilterPanel, FilterSelect, HubEmpty, HubLoad, InfoRow, RichBlock, SearchField } from './HubCommon';
import { DocumentPicker } from './LibrarySections';

/**
 * Quick Links: Insurance, Booking Policy, QA Tips, CRM Dictionary, Department Working Hours.
 * Egypt shows filterable cards; KSA shows the documents (legacy behaviour).
 */

const tabClass = (active: boolean) => `btn ${active ? 'btn-primary' : 'btn-outline'}`;

/** Section body / notes value, or a dash. */
const Body = ({ value, arabic }: { value: string; arabic?: boolean }) => (value ? <RichBlock value={value} arabic={arabic} /> : <p className="hub-muted">—</p>);

// ---- Insurance ----

export function InsuranceSection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`insurance:${region}`} loader={() => loadInsurance(region)} label="insurance companies">
      {(companies) => (region === 'KSA' ? <DocumentPicker docs={companies} icon="🛡️" empty="No insurance companies found" /> : <EgyInsurance companies={companies} />)}
    </HubLoad>
  );
}

function EgyInsurance({ companies }: { companies: InsuranceCompany[] }) {
  const [filters, setFilters] = useState({ type: '', bu: '', search: '' });
  const types = choicesOf(companies, (c) => c.type);
  const bus = choicesOf(companies, (c) => c.bu);
  const list = companies.filter(
    (c) => (!filters.type || String(c.type?.value) === filters.type) && (!filters.bu || String(c.bu?.value) === filters.bu) && includesText([c.name], filters.search),
  );
  return (
    <>
      <div className="bento">
        <div className="sub-hdr">Company Type</div>
        <div className="filter-bar">
          <button type="button" className={tabClass(!filters.type)} onClick={() => setFilters({ ...filters, type: '' })}>All</button>
          {types.map((type) => (
            <button key={type.value} type="button" className={tabClass(filters.type === type.value)} onClick={() => setFilters({ ...filters, type: type.value })}>
              {type.label}
            </button>
          ))}
        </div>
      </div>
      <FilterPanel summary={foundText(list.length, 'company', 'companies')} canClear={Boolean(filters.type || filters.bu || filters.search)} onClear={() => setFilters({ type: '', bu: '', search: '' })}>
        <FilterSelect label="Business Unit" allLabel="All BUs" value={filters.bu} options={bus} onChange={(bu) => setFilters({ ...filters, bu })} />
        <SearchField label="Search Company" value={filters.search} placeholder="Search by company name…" onChange={(search) => setFilters({ ...filters, search })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No companies found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((c) => (
            <article key={c.id} className="ro-card hub-card">
              <h3 className="hub-card-title" dir="auto">{c.name}</h3>
              <div className="hub-card-meta" dir="auto">{[c.bu?.label ?? '—', c.type?.label].filter(Boolean).join(' • ')}</div>
              <div className="hub-subblock">
                <div className="field-lbl">🚫 Uncovered Services</div>
                <Body value={c.uncovered} arabic />
              </div>
              <div className="hub-subblock">
                <div className="field-lbl">📝 Notes</div>
                <Body value={c.notes} arabic />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Booking policy ----

export function BookingPolicySection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`booking-policy:${region}`} loader={() => loadBookingPolicies(region)} label="booking policies">
      {(policies) => (region === 'KSA' ? <DocumentPicker docs={policies} icon="📘" empty="No booking policies found" /> : <EgyBookingPolicy policies={policies} />)}
    </HubLoad>
  );
}

function EgyBookingPolicy({ policies }: { policies: BookingPolicy[] }) {
  const [bu, setBu] = useState('');
  const bus = [...new Map(policies.filter((p) => p.buId && p.buName).map((p) => [p.buId, p.buName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const list = policies.filter((p) => !bu || p.buId === bu);
  return (
    <>
      <div className="bento">
        <div className="sub-hdr">Business Unit</div>
        <div className="filter-bar">
          <button type="button" className={tabClass(!bu)} onClick={() => setBu('')}>All</button>
          {bus.map(([id, name]) => (
            <button key={id} type="button" className={tabClass(bu === id)} onClick={() => setBu(id)}>{name}</button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No booking policies found" sub="Pick another business unit" /></div>
      ) : (
        <div className="hub-list">
          {list.map((p) => (
            <details key={p.id} className="ro-card hub-fold" open={list.length === 1}>
              <summary className="ro-title">🏥 {p.buName || 'Business Unit'}</summary>
              <div className="hub-subblock">
                <div className="field-lbl">📘 Booking Policy</div>
                <Body value={p.policy} arabic />
              </div>
              <div className="hub-subblock">
                <div className="field-lbl">📝 Notes</div>
                <Body value={p.notes} arabic />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

// ---- QA tips ----

export function QaTipsSection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`qa-tips:${region}`} loader={() => loadQaTips(region)} label="QA tips">
      {(tips) => (region === 'KSA' ? <DocumentPicker docs={tips} icon="✅" empty="No QA tips found" /> : <EgyQaTips tips={tips} />)}
    </HubLoad>
  );
}

function EgyQaTips({ tips }: { tips: QaTip[] }) {
  const [filters, setFilters] = useState({ bu: '', service: '', search: '' });
  const bus = [...new Map(tips.filter((t) => t.buId && t.buName).map((t) => [t.buId, t.buName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const services = choicesOf(tips, (t) => t.service);
  const list = tips.filter((t) => (!filters.bu || t.buId === filters.bu) && (!filters.service || String(t.service?.value) === filters.service) && includesText([t.name], filters.search));
  return (
    <>
      <FilterPanel summary={foundText(list.length, 'tip')} canClear={Boolean(filters.bu || filters.service || filters.search)} onClear={() => setFilters({ bu: '', service: '', search: '' })}>
        <FilterSelect label="Business Unit" allLabel="All BUs" value={filters.bu} options={bus} onChange={(bu) => setFilters({ ...filters, bu })} />
        <FilterSelect label="Service" allLabel="All" value={filters.service} options={services} onChange={(service) => setFilters({ ...filters, service })} />
        <SearchField label="Search Tip" value={filters.search} placeholder="Search by tip name…" onChange={(search) => setFilters({ ...filters, search })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No QA tips found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((t) => (
            <article key={t.id} className="ro-card hub-card">
              <h3 className="hub-card-title" dir="auto">{t.name}</h3>
              <div className="hub-card-meta">🏥 {t.buName || 'Business Unit'}{t.service && ` • ${t.service.label}`}</div>
              <div className="hub-subblock">
                <div className="field-lbl">Comment</div>
                <Body value={t.comment} />
              </div>
              {t.details && (
                <div className="hub-subblock">
                  <div className="field-lbl">Details</div>
                  <RichBlock value={t.details} />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// ---- CRM dictionary ----

export function CrmDictionarySection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`crm-dictionary:${region}`} loader={() => loadCrmDictionary(region)} label="the CRM dictionary">
      {(entries) => (region === 'KSA' ? <DocumentPicker docs={entries} icon="📖" empty="No records found" /> : <EgyCrmDictionary entries={entries} />)}
    </HubLoad>
  );
}

function EgyCrmDictionary({ entries }: { entries: CrmEntry[] }) {
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const reasons = choicesOf(entries, (e) => e.reason);
  const list = entries.filter((e) => (!reason || String(e.reason?.value) === reason) && includesText([e.name, e.type], search));
  return (
    <>
      <div className="bento">
        <div className="sub-hdr">Feedback Reason</div>
        <div className="filter-bar">
          <button type="button" className={tabClass(!reason)} onClick={() => setReason('')}>All</button>
          {reasons.map((item) => (
            <button key={item.value} type="button" className={tabClass(reason === item.value)} onClick={() => setReason(item.value)}>{item.label}</button>
          ))}
        </div>
      </div>
      <FilterPanel summary={foundText(list.length, 'record')} canClear={Boolean(reason || search)} onClear={() => { setReason(''); setSearch(''); }}>
        <SearchField label="Search" value={search} placeholder="Search by reason or type…" onChange={setSearch} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No records found" sub="Pick another reason" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((e) => (
            <article key={e.id} className="ro-card hub-card">
              <h3 className="hub-card-title" dir="auto">{e.name}</h3>
              {e.reason && <div className="hub-card-meta">{e.reason.label}</div>}
              <div className="kv-grid hub-card-body">
                <InfoRow label="Type">{e.type || '—'}</InfoRow>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

// ---- Department working hours ----

export function WorkingHoursSection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`working-hours:${region}`} loader={() => loadWorkingHours(region)} label="working hours">
      {(rows) => (region === 'KSA' ? <DocumentPicker docs={rows} icon="🕒" empty="No records found" /> : <EgyWorkingHours rows={rows} />)}
    </HubLoad>
  );
}

function EgyWorkingHours({ rows }: { rows: WorkingHours[] }) {
  const empty = { bu: '', type: '', department: '', search: '' };
  const [filters, setFilters] = useState(empty);
  const bus = [...new Map(rows.filter((r) => r.buId && r.buName).map((r) => [r.buId, r.buName])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const list = rows.filter(
    (r) =>
      (!filters.bu || r.buId === filters.bu) &&
      (!filters.type || String(r.type?.value) === filters.type) &&
      (!filters.department || String(r.department?.value) === filters.department) &&
      includesText([r.department?.label ?? '', r.name], filters.search),
  );
  return (
    <>
      <FilterPanel summary={foundText(list.length, 'department')} canClear={JSON.stringify(filters) !== JSON.stringify(empty)} onClear={() => setFilters(empty)}>
        <FilterSelect label="Business Unit" allLabel="All BUs" value={filters.bu} options={bus} onChange={(bu) => setFilters({ ...filters, bu })} />
        <FilterSelect label="Type" allLabel="All" value={filters.type} options={choicesOf(rows, (r) => r.type)} onChange={(type) => setFilters({ ...filters, type })} />
        <FilterSelect label="Department" allLabel="All" value={filters.department} options={choicesOf(rows, (r) => r.department)} onChange={(department) => setFilters({ ...filters, department })} />
        <SearchField label="Search Department" value={filters.search} placeholder="Search by department…" onChange={(search) => setFilters({ ...filters, search })} />
      </FilterPanel>
      {list.length === 0 ? (
        <div className="bento"><HubEmpty title="No working hours found" sub="Try adjusting your filters" /></div>
      ) : (
        <div className="hub-grid">
          {list.map((r) => (
            <article key={r.id} className="ro-card hub-card">
              <h3 className="hub-card-title" dir="auto">{r.department?.label || r.name || '—'}</h3>
              <div className="hub-card-meta">🏥 {r.buName || 'Business Unit'}{r.type && ` • ${r.type.label}`}</div>
              <div className="hub-subblock">
                <div className="field-lbl">Working Hours</div>
                <Body value={r.hours} />
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
