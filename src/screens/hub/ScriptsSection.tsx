import { useState } from 'react';
import type { Region } from '../../app/region';
import { foundText } from '../../data/hub/common';
import { loadScripts, type Script, type ScriptsData } from '../../data/hub/scripts';
import { FilterSelect, HubEmpty, HubLoad, RichBlock } from './HubCommon';

/**
 * Legacy "Scripts & Knowledge": pick a category and sub-category. Egypt shows foldable script
 * cards (with a business-unit filter); KSA shows the scripts table.
 */
export function ScriptsSection({ region }: { region: Region }) {
  return (
    <HubLoad cacheKey={`scripts:${region}`} loader={() => loadScripts(region)} label="scripts">
      {(data) => <ScriptsBrowser data={data} region={region} />}
    </HubLoad>
  );
}

const tabClass = (active: boolean, primary = true) => `btn ${active ? 'btn-primary' : primary ? 'btn-outline' : 'btn-ghost'}`;

function ScriptsBrowser({ data, region }: { data: ScriptsData; region: Region }) {
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [bu, setBu] = useState('');

  const subCategories = data.subCategories.filter((sub) => sub.categoryId === categoryId);
  const scripts = data.scripts.filter((s) => s.categoryId === categoryId && s.subCategoryId === subCategoryId && (region === 'KSA' || !bu || s.buId === bu));
  const categoryName = data.categories.find((c) => c.id === categoryId)?.name ?? '';
  const subName = subCategories.find((s) => s.id === subCategoryId)?.name ?? '';

  return (
    <>
      <div className="bento">
        <div className="sub-hdr">Category</div>
        {data.categories.length ? (
          <div className="filter-bar">
            {data.categories.map((c) => (
              <button key={c.id} type="button" className={tabClass(c.id === categoryId)} onClick={() => { setCategoryId(c.id); setSubCategoryId(''); }}>
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="hub-muted">No categories found.</p>
        )}
        {categoryId && (
          <>
            <div className="sub-hdr">Sub-Category</div>
            {subCategories.length ? (
              <div className="filter-bar">
                {subCategories.map((s) => (
                  <button key={s.id} type="button" className={tabClass(s.id === subCategoryId, false)} onClick={() => setSubCategoryId(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hub-muted">No sub-categories in this category.</p>
            )}
          </>
        )}
        {region === 'EGY' && subCategoryId && (
          <div className="hub-filters hub-gap">
            <FilterSelect label="Business Unit" allLabel="All Business Units" value={bu} options={data.bus.map((b) => ({ value: b.id, label: b.name }))} onChange={setBu} />
          </div>
        )}
      </div>

      {!subCategoryId ? (
        <div className="bento"><HubEmpty title="Choose a category" sub="Pick a category and a sub-category to see its scripts." /></div>
      ) : scripts.length === 0 ? (
        <div className="bento"><HubEmpty title="No scripts found" sub={bu ? 'Try selecting a different business unit or clear filters' : 'No scripts available for this category'} /></div>
      ) : region === 'KSA' ? (
        <KsaScriptsTable scripts={scripts} />
      ) : (
        <>
          <div className="hub-count hub-count-note">{foundText(scripts.length, 'script')}</div>
          <div className="hub-list">
            {scripts.map((s) => (
              <details key={s.id} className="ro-card hub-fold hub-fold-card">
                <summary>
                  <span className="hub-card-names">
                    <span className="sbadge sbadge-green hub-self-start">🏥 {s.buName || 'N/A'}</span>
                    <span className="hub-card-title" dir="auto">{s.name || 'Script'}</span>
                    <span className="hub-card-meta" dir="auto">{categoryName}{subName && ` • ${subName}`}</span>
                  </span>
                </summary>
                {s.script ? <RichBlock value={s.script} arabic /> : <p className="hub-muted">No script content</p>}
                {s.order !== null && <div className="hub-muted hub-gap">Order: {s.order}</div>}
              </details>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function KsaScriptsTable({ scripts }: { scripts: Script[] }) {
  return (
    <div className="bento hub-table-wrap">
      <table className="req-table hub-table">
        <thead>
          <tr>
            <th>Tag</th>
            <th>Name</th>
            <th>Notes</th>
            <th>Script</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {scripts.map((s) => (
            <tr key={s.id}>
              <td dir="auto">{s.tag}</td>
              <td dir="auto">{s.name}</td>
              <td>{s.notes && <RichBlock value={s.notes} />}</td>
              <td>{s.script && <RichBlock value={s.script} />}</td>
              <td>{s.order ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
