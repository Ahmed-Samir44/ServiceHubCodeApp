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
import { FilterPanel, FilterSelect, HubEmpty, HubLoad, SearchField } from './HubCommon';
import { InfoCard } from './InfoCard';
import { DocumentPicker } from './LibrarySections';

/**
 * Quick Links: Insurance, Booking Policy, QA Tips, CRM Dictionary, Department Working Hours.
 * Egypt shows filterable cards; KSA shows the documents (legacy behaviour).
 */

const tabClass = (active: boolean) => `btn ${active ? 'btn-primary' : 'btn-outline'}`;


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
        <div className="info-list">
          {list.map((c) => (
            <InfoCard
              key={c.id}
              title={c.name}
              tags={[c.bu?.label, c.type?.label]}
              sections={[
                { label: 'Uncovered Services', value: c.uncovered, arabic: true },
                { label: 'Notes', value: c.notes, arabic: true },
              ]}
            />
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
        <div className="info-list">
          {list.map((p) => (
            <InfoCard
              key={p.id}
              foldable
              open={list.length === 1}
              title={p.buName || 'Business Unit'}
              tags={[]}
              sections={[
                { label: 'Booking Policy', value: p.policy, arabic: true },
                { label: 'Notes', value: p.notes, arabic: true },
              ]}
            />
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
        <div className="info-list">
          {list.map((t) => (
            <InfoCard
              key={t.id}
              title={t.name}
              tags={[t.buName, t.service?.label]}
              sections={[{ label: 'Comment', value: t.comment }, ...(t.details ? [{ label: 'Details', value: t.details }] : [])]}
            />
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
        <div className="info-list">
          {list.map((e) => (
            <InfoCard key={e.id} title={e.name} tags={[e.reason?.label]} sections={[{ label: 'Type', value: e.type }]} />
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
        <div className="info-list">
          {list.map((r) => (
            // Legacy card: folded, the BU as header; opening it shows Department, Type and Working Hours.
            <InfoCard
              key={r.id}
              foldable
              title={r.buName || 'Business Unit'}
              tags={[]}
              sections={[
                { label: 'Department', value: r.department?.label ?? '' },
                { label: 'Type', value: r.type?.label ?? '' },
                { label: 'Working Hours', value: r.hours, arabic: true },
              ]}
            />
          ))}
        </div>
      )}
    </>
  );
}
