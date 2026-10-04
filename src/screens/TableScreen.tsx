import { useState } from 'react';
import { Element3 } from 'iconsax-react';
import type { TableRef } from '../app/navigation';
import type { Region } from '../app/region';
import { useAsyncData } from '../data/useAsyncData';
import { loadViews, pickView, readDefaultView } from '../data/views';
import { ViewGrid } from './grid/ViewGrid';
import { PageHeader } from './PageHeader';
import { useToasts } from './grid/useToasts';
import { RecordForm, type FormTarget } from './RecordForm';

interface TableScreenProps {
  label: string;
  table: TableRef;
  region: Region | null;
}

/** Records of one Dataverse table, shown through the table's own system views (EGY / KSA / default). */
export function TableScreen({ label, table, region }: TableScreenProps) {
  const [viewsReload, setViewsReload] = useState(0);
  // null = follow the region automatically; set once the user picks a view themselves.
  const [chosenViewId, setChosenViewId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [defaultViewId] = useState<string | null>(() => readDefaultView(table.logicalName));
  const { notify, rack } = useToasts();

  const views = useAsyncData(`${table.logicalName}#${viewsReload}`, () => loadViews(table, { refresh: viewsReload > 0 }));
  const viewList = views.data ?? [];
  const activeView = viewList.find((view) => view.id === chosenViewId) ?? pickView(viewList, region, defaultViewId);

  return (
    <>
      <PageHeader
        title={label}
        icon={Element3}
        subtitle={
          <>
            {activeView ? activeView.name : 'Active records'}
            <span className="table-pill">{label}</span>
          </>
        }
      />
      <div className="content content-wide">
        <div className="bento">
          {views.loading && (
            <div className="loader-box" role="status">
              <div className="loader-ring" />
              <div className="loader-text">Loading views…</div>
            </div>
          )}
          {views.error && (
            <div className="empty-state" role="alert">
              <div className="empty-title">Couldn’t load views</div>
              <div className="empty-sub" dir="auto">{views.error}</div>
              <button type="button" className="btn btn-primary" onClick={() => setViewsReload((count) => count + 1)}>
                Try again
              </button>
            </div>
          )}
          {views.data && !activeView && (
            <div className="empty-state">
              <div className="empty-icon">
                <Element3 size={22} color="currentColor" variant="Bulk" />
              </div>
              <div className="empty-title">No views available</div>
              <div className="empty-sub">This table has no active public view you can open.</div>
            </div>
          )}
          {activeView && (
            <ViewGrid
              key={activeView.id}
              table={table}
              tableLabel={label}
              views={viewList}
              view={activeView}
              region={region}
              onChooseView={setChosenViewId}
              onOpenRecord={(id, siblings) => setForm({ table, label, id, siblings })}
              onOpenRelated={setForm}
              onNewRecord={() => setForm({ table, label, id: null })}
              notify={notify}
              externalReload={savedCount}
              userDefaultViewId={defaultViewId}
            />
          )}
        </div>
      </div>
      {form && (
        <RecordForm
          key={`${form.table.logicalName}#${form.id ?? 'new'}`}
          target={form}
          notify={notify}
          onChanged={() => setSavedCount((count) => count + 1)}
          onClose={() => setForm(null)}
        />
      )}
      {rack}
    </>
  );
}
