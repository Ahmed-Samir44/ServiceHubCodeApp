import { useState } from 'react';
import { ArrowLeft, DocumentText, Note1 } from 'iconsax-react';
import type { Region } from '../../app/region';
import { clearHubCache } from '../../data/hub/common';
import { openInPopup } from '../../data/fileLinks';
import { loadHomeCare, type HomeCareRecord } from '../../data/hub/programs';
import { useAsyncData } from '../../data/useAsyncData';
import { HubEmpty, HubError, HubLoading, RichBlock } from './HubCommon';

/**
 * Legacy "Home Care": pick a business unit, then Knowledge Base (documents shown in a viewer) or
 * Scripts (category → sub-category → script).
 */

type Mode = 'kb' | 'scripts';

interface Selection {
  buId: string;
  mode: Mode | null;
  categoryId: string;
  subCategoryId: string;
  open: HomeCareRecord | null;
}

const EMPTY: Selection = { buId: '', mode: null, categoryId: '', subCategoryId: '', open: null };

/** Distinct [id, name] pairs, in name order. */
const distinct = (records: readonly HomeCareRecord[], id: (r: HomeCareRecord) => string, name: (r: HomeCareRecord) => string) =>
  [...new Map(records.filter((r) => id(r)).map((r) => [id(r), name(r) || id(r)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

export function HomeCareSection({ region }: { region: Region }) {
  const [reload, setReload] = useState(0);
  const [sel, setSel] = useState<Selection>(EMPTY);
  const data = useAsyncData(`home-care:${region}:${reload}`, () => loadHomeCare(region));
  const retry = () => {
    clearHubCache(`home-care:${region}`);
    setReload((count) => count + 1);
  };

  if (data.loading) return <div className="bento"><HubLoading label="Loading home care…" /></div>;
  if (data.error || !data.data) return <div className="bento"><HubError title="Couldn’t load home care" message={data.error ?? ''} onRetry={retry} /></div>;
  const records = data.data;
  if (records.length === 0) return <div className="bento"><HubEmpty title="No Business Units found" sub="No home care content is listed for this region yet." /></div>;

  const buRecords = records.filter((r) => r.buId === sel.buId);
  const tab = (active: boolean) => `btn ${active ? 'btn-primary' : 'btn-outline'}`;

  if (sel.open) {
    // Only scripts open here; Knowledge Base documents open in the pop-up window.
    const record = sel.open;
    return (
      <>
        <button type="button" className="back-link" onClick={() => setSel({ ...sel, open: null })}>
          <ArrowLeft size={12} color="currentColor" /> Back
        </button>
        <div className="bento">
          <div className="hub-viewer-hdr">
            <h2 className="hub-profile-title" dir="auto">{record.name || 'Untitled'}</h2>
          </div>
          {record.script ? <RichBlock value={record.script} arabic /> : <p className="hub-muted">No script text.</p>}
        </div>
      </>
    );
  }

  return (
    <div className="bento">
      <div className="sub-hdr">Business Unit</div>
      <div className="filter-bar">
        {distinct(records, (r) => r.buId, (r) => r.buName).map(([id, name]) => (
          <button key={id} type="button" className={tab(id === sel.buId)} onClick={() => setSel({ ...EMPTY, buId: id })}>
            {name}
          </button>
        ))}
      </div>

      {sel.buId && (
        <div className="filter-bar hub-gap">
          <button type="button" className={tab(sel.mode === 'kb')} onClick={() => setSel({ ...EMPTY, buId: sel.buId, mode: 'kb' })}>
            <DocumentText size={14} color="currentColor" /> Knowledge Base
          </button>
          <button type="button" className={tab(sel.mode === 'scripts')} onClick={() => setSel({ ...EMPTY, buId: sel.buId, mode: 'scripts' })}>
            <Note1 size={14} color="currentColor" /> Scripts
          </button>
        </div>
      )}

      {sel.mode === 'kb' && <RecordTiles records={buRecords.filter((r) => r.documentUrl)} icon="📄" empty="No Knowledge Base items for this BU." onOpen={(open) => openInPopup(open.documentUrl.trim(), open.name)} />}

      {sel.mode === 'scripts' && (
        <>
          <div className="sub-hdr">Category</div>
          <ChoiceBar
            items={distinct(buRecords, (r) => r.categoryId, (r) => r.categoryName)}
            value={sel.categoryId}
            empty="No categories found."
            onPick={(categoryId) => setSel({ ...sel, categoryId, subCategoryId: '' })}
          />
          {sel.categoryId && (
            <>
              <div className="sub-hdr">Sub-Category</div>
              <ChoiceBar
                items={distinct(buRecords.filter((r) => r.categoryId === sel.categoryId), (r) => r.subCategoryId, (r) => r.subCategoryName)}
                value={sel.subCategoryId}
                empty="No subcategories found."
                onPick={(subCategoryId) => setSel({ ...sel, subCategoryId })}
              />
            </>
          )}
          {sel.subCategoryId && (
            <RecordTiles
              records={buRecords.filter((r) => r.categoryId === sel.categoryId && r.subCategoryId === sel.subCategoryId)}
              icon="📜"
              empty="No scripts found."
              onOpen={(open) => setSel({ ...sel, open })}
            />
          )}
        </>
      )}
    </div>
  );
}

function ChoiceBar({ items, value, empty, onPick }: { items: [string, string][]; value: string; empty: string; onPick: (id: string) => void }) {
  if (!items.length) return <p className="hub-muted">{empty}</p>;
  return (
    <div className="filter-bar">
      {items.map(([id, name]) => (
        <button key={id} type="button" className={`btn ${id === value ? 'btn-primary' : 'btn-ghost'}`} onClick={() => onPick(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

function RecordTiles({ records, icon, empty, onOpen }: { records: HomeCareRecord[]; icon: string; empty: string; onOpen: (record: HomeCareRecord) => void }) {
  if (!records.length) return <p className="hub-muted hub-gap">{empty}</p>;
  return (
    <div className="hub-grid hub-grid-sm hub-gap">
      {records.map((record) => (
        <button key={record.id} type="button" className="ro-card hub-card hub-card-btn" onClick={() => onOpen(record)}>
          <span className="hub-card-title" dir="auto">{icon} {record.name || 'Untitled'}</span>
        </button>
      ))}
    </div>
  );
}
