import { Dropdown } from '../Dropdown';
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cssZoom } from '../../app/preferences';
import {
  Add,
  ArrowDown,
  ArrowDown2,
  ArrowUp,
  CloseCircle,
  DocumentDownload,
  Edit2,
  Filter,
  FilterRemove,
  Profile2User,
  Refresh,
  RowVertical,
  SearchNormal1,
  Share,
  Sms,
  TickCircle,
  Trash,
} from 'iconsax-react';
import { findTable, type TableRef } from '../../app/navigation';
import { usePermissions } from '../../app/permissionsContext';
import { REGION_LABEL, type Region } from '../../app/region';
import { onFileLinkClick } from '../../data/fileLinks';
import { readColumnPrefs, writeColumnPrefs, type ColumnPrefs } from '../../data/columnPrefs';
import { columnMeta } from '../../data/columnMeta';
import { DATA_ORG_URL } from '../../data/config';
import { deleteRow, errorMessage, listRows, setRowState, type DataverseRow, type ListResult } from '../../data/dataverse';
import { exportToExcel } from '../../data/exportExcel';
import { applyGridQuery, filterAttributes, parseViewFilter, quickFindPattern, removeAttribute, viewSort, type FilterCondition, type FilterGroup } from '../../data/fetchQuery';
import { cellLink, formatCell, lookupTarget } from '../../data/formatCell';
import { useAsyncData } from '../../data/useAsyncData';
import {
  availableColumns,
  loadQuickFindColumns,
  pageFetchXml,
  tableColumn,
  withAttributes,
  type GridColumn,
  type TableView,
} from '../../data/views';
import { ColumnPicker } from '../ColumnPicker';
import { AssignDialog, ShareDialog } from '../form/RecordDialogs';
import type { FormTarget } from '../RecordForm';
import { BulkEditDialog } from './BulkEditDialog';
import { ColumnMenu, type ColumnMenuAnchor } from './ColumnMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { ColumnFilterPopover } from './ColumnFilterPopover';
import { FilterEditor } from './FilterEditor';

const PAGE_SIZE = 50;
/** Smallest rows box on very short windows (then the page scrolls a little instead). */
const MIN_GRID_HEIGHT = 200;
const MIN_COLUMN_WIDTH = 50;
const MAX_COLUMN_WIDTH = 800;
const EXPORT_PAGE_SIZE = 5000;
const EXPORT_MAX_ROWS = 50000;

const linkStyle = { color: 'var(--gold-dark)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' } as const;

type BulkAction = 'delete' | 'activate' | 'deactivate';

interface ViewGridProps {
  table: TableRef;
  tableLabel: string;
  views: readonly TableView[];
  view: TableView;
  region: Region | null;
  onChooseView: (id: string) => void;
  /** Open a record; `siblings` are the ids on this page, for ↑ / ↓ navigation in the form. */
  onOpenRecord: (id: string, siblings: readonly string[]) => void;
  onOpenRelated: (record: FormTarget) => void;
  onNewRecord: () => void;
  notify: (kind: 'success' | 'alert', text: string) => void;
  /** Bumped by the parent after a record is saved elsewhere, to reload the grid. */
  externalReload: number;
  /** "Set as default view" choice for this table (this browser), if any. */
  userDefaultViewId: string | null;
  /** Personal views were created/updated/deleted: reload the list and select `selectId` if given. */
}

/**
 * Model-driven style grid for one view: command bar (New, Delete, Refresh, Activate, Deactivate,
 * Export to Excel, Email a link), row selection, column menu (sort,
 * filter, width, move), "Edit filters", "Edit columns" and keyword search.
 * Remounted per view (key), so paging, sort and filters start fresh on every view change.
 */
export function ViewGrid({
  table, tableLabel, views, view, region, onChooseView, onOpenRecord, onOpenRelated, onNewRecord, notify, externalReload,
  userDefaultViewId,
}: ViewGridProps) {
  const { privileges } = usePermissions();
  const canCreate = privileges.can(table.logicalName, 'create');
  const canWrite = privileges.can(table.logicalName, 'write');
  const canDelete = privileges.can(table.logicalName, 'delete');
  const canAssign = privileges.can(table.logicalName, 'assign');
  const canShare = privileges.can(table.logicalName, 'share');
  const [recordDialog, setRecordDialog] = useState<'bulk-edit' | 'assign' | 'share' | null>(null);
  const [page, setPage] = useState(1);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [gridMaxHeight, setGridMaxHeight] = useState<number>();
  const [reload, setReload] = useState(0);
  const [prefs, setPrefs] = useState<ColumnPrefs>(() => readColumnPrefs(table.logicalName, view.id));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState<FilterGroup | undefined>(undefined);
  // Model-driven column filters ("Filter by" on a header), ANDed with the view / edited filter.
  const [columnFilters, setColumnFilters] = useState<Record<string, FilterCondition>>({});
  const [columnFilterAt, setColumnFilterAt] = useState<{ column: GridColumn; left: number; top: number } | null>(null);
  const [sort, setSort] = useState<{ attribute: string; descending: boolean } | undefined>(undefined);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchText, setSearchText] = useState('');
  const [menu, setMenu] = useState<ColumnMenuAnchor | null>(null);

  // Drag a header's right edge to resize the column (like the model-driven grid). Pointer capture
  // keeps the drag on the handle even when the mouse moves off it — no document listeners needed.
  const dragRef = useRef<{ name: string; startX: number; startWidth: number; zoom: number } | null>(null);
  const resizeHandlers = (column: GridColumn) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { name: column.name, startX: event.clientX, startWidth: column.width, zoom: cssZoom(event.currentTarget) };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.name !== column.name) return;
      const width = Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, drag.startWidth + (event.clientX - drag.startX) / drag.zoom)));
      setResizing({ name: column.name, width });
    },
    onPointerUp: (event: ReactPointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      if (!drag || !resizing || resizing.name !== drag.name) return;
      const width = resizing.width;
      setResizing(null);
      if (width !== drag.startWidth) savePrefs({ ...prefs, widths: { ...prefs.widths, [drag.name]: width } });
    },
  });

  /** Double-click a header edge: back to the view's own width for that column. */
  const resetWidth = (name: string) => {
    if (!prefs.widths?.[name]) return;
    const widths = { ...prefs.widths };
    delete widths[name];
    savePrefs({ ...prefs, widths: Object.keys(widths).length ? widths : undefined });
  };
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ---- columns (view layout + "Edit columns" + widths) ----
  const baseColumns: GridColumn[] = prefs.columns
    ? prefs.columns.map((name) => view.columns.find((column) => column.name === name) ?? tableColumn(name, table.logicalName))
    : view.columns;
  // Live width while a column border is being dragged; saved to prefs on release.
  const [resizing, setResizing] = useState<{ name: string; width: number } | null>(null);
  const columns = baseColumns.map((column) => ({
    ...column,
    width: resizing?.name === column.name ? resizing.width : (prefs.widths?.[column.name] ?? column.width),
  }));
  const columnNames = columns.map((column) => column.name);

  const savePrefs = (next: ColumnPrefs) => {
    setPrefs(next);
    writeColumnPrefs(table.logicalName, view.id, next);
  };
  const setColumnOrder = (names: string[] | null) => {
    const isViewDefault = names !== null && names.join(',') === view.columns.map((column) => column.name).join(',');
    savePrefs({ ...prefs, columns: isViewDefault || names === null ? undefined : names });
    setPage(1);
  };

  // ---- query: view FetchXML + added columns + filters + keyword + sort, then paging ----
  const viewFilter = parseViewFilter(view.fetchXml);
  const columnConditions = Object.values(columnFilters);
  // Filter in effect: the (edited) view filter plus the column filters; undefined = the view as saved.
  const effectiveFilter: FilterGroup | undefined =
    filter === undefined && columnConditions.length === 0 ? undefined : { kind: 'group', id: 'grid-filter', type: 'and', items: [filter ?? viewFilter, ...columnConditions] };
  const effectiveSort = sort ?? viewSort(view.fetchXml) ?? undefined;
  // Keyword search uses the table's Quick Find "Find columns", like the model-driven search box;
  // the record name is the fallback when a table has no Quick Find view.
  const quickFind = useAsyncData(`quickfind#${table.logicalName}`, () => loadQuickFindColumns(table));
  const searchAttributes = quickFind.data?.length ? quickFind.data : [table.primaryName];
  const searchPattern = quickFindPattern(searchText);
  const queryFetchXml = applyGridQuery(withAttributes(view.fetchXml, columnNames), {
    filter: effectiveFilter,
    sort,
    search: searchPattern ? { pattern: searchPattern, attributes: searchAttributes } : undefined,
  });
  const paged = pageFetchXml(queryFetchXml, page, PAGE_SIZE);
  const records = useAsyncData<ListResult>(`${paged.fetchXml}#${reload}#${externalReload}`, () =>
    listRows({ entitySet: table.entitySet, fetchXml: paged.fetchXml }),
  );

  const rows = records.data?.rows ?? [];
  const hasMore = records.data?.moreRecords ?? rows.length === PAGE_SIZE;
  const total = records.data?.totalCount ?? null;
  const firstRow = (page - 1) * PAGE_SIZE + 1;
  const primaryKey = `${table.logicalName}id`;
  const rowId = (row: DataverseRow) => (typeof row[primaryKey] === 'string' ? (row[primaryKey] as string) : null);

  // Selection belongs to the rows currently shown; any query change clears it (derived, no effect).
  const selectionKey = `${paged.fetchXml}#${reload}#${externalReload}`;
  const selected = selection.key === selectionKey ? selection.ids : [];
  const pageIds = rows.map(rowId).filter((id): id is string => id !== null);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const toggle = (id: string) =>
    setSelection({ key: selectionKey, ids: selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id] });

  const refresh = () => setReload((count) => count + 1);
  const resetPage = () => setPage(1);

  // ---- command bar actions ----
  const runBulk = async (action: BulkAction) => {
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    for (const id of selected) {
      try {
        if (action === 'delete') await deleteRow(table.entitySet, id);
        else await setRowState(table.entitySet, id, action === 'activate');
        done += 1;
      } catch (error) {
        failures.push(errorMessage(error));
      }
    }
    setBusy(false);
    setPendingAction(null);
    const verb = action === 'delete' ? 'Deleted' : action === 'activate' ? 'Activated' : 'Deactivated';
    if (done) notify('success', `${verb} ${done} record${done === 1 ? '' : 's'}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    refresh();
  };

  const runExport = async (scope: 'page' | 'all') => {
    setExportOpen(false);
    setExporting(true);
    try {
      let exportRows: DataverseRow[] = rows;
      if (scope === 'all') {
        exportRows = [];
        for (let exportPage = 1; exportRows.length < EXPORT_MAX_ROWS; exportPage += 1) {
          const batch = await listRows({ entitySet: table.entitySet, fetchXml: pageFetchXml(queryFetchXml, exportPage, EXPORT_PAGE_SIZE).fetchXml });
          exportRows.push(...batch.rows);
          if (!(batch.moreRecords ?? batch.rows.length === EXPORT_PAGE_SIZE)) break;
        }
      }
      await exportToExcel(`${tableLabel} - ${view.name}`, columns, exportRows);
      notify('success', `Exported ${exportRows.length.toLocaleString()} record${exportRows.length === 1 ? '' : 's'} to Excel.`);
    } catch (error) {
      notify('alert', `Export failed: ${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  };

  const recordUrl = (id: string) => `${DATA_ORG_URL}/main.aspx?pagetype=entityrecord&etn=${table.logicalName}&id=${id}`;
  const emailLink = () => {
    const body = selected.map(recordUrl).join('\n');
    window.location.href = `mailto:?subject=${encodeURIComponent(`${tableLabel}: ${selected.length} record(s)`)}&body=${encodeURIComponent(body)}`;
  };

  // ---- column header menu ----
  const openMenu = (column: GridColumn, element: HTMLElement) => {
    // The menu is fixed-positioned inside the zoomed content area (text size), so viewport pixels
    // are converted to that element's CSS pixels.
    const rect = element.getBoundingClientRect();
    const zoom = cssZoom(element);
    setMenu({ column, left: Math.min(rect.left, window.innerWidth - 230 * zoom) / zoom, top: (rect.bottom + 4) / zoom });
  };
  const menuIndex = menu ? columnNames.indexOf(menu.column.name) : -1;
  const moveColumn = (delta: -1 | 1) => {
    if (menuIndex < 0) return;
    const names = [...columnNames];
    const [name] = names.splice(menuIndex, 1);
    names.splice(menuIndex + delta, 0, name);
    setColumnOrder(names);
    setMenu(null);
  };
  const filterModified = effectiveFilter !== undefined;
  const filterFields = availableColumns(table.logicalName)
    .filter((column) => columnMeta(table.logicalName, column.name))
    .map((column) => ({ name: column.name, label: column.label }));
  // Columns showing the filter icon: column filters + conditions the user added in "Edit filters".
  const viewFilterAttributes = filterAttributes(viewFilter);
  const filteredColumns = new Set([...Object.keys(columnFilters), ...[...filterAttributes(filter)].filter((name) => !viewFilterAttributes.has(name))]);
  const clearColumnFilter = (name: string) => {
    setColumnFilters((prev) => Object.fromEntries(Object.entries(prev).filter(([attribute]) => attribute !== name)));
    if (filter) setFilter(removeAttribute(filter, name));
    resetPage();
  };
  const clearAllFilters = () => {
    setFilter(undefined);
    setColumnFilters({});
    resetPage();
  };
  const openColumnFilter = (column: GridColumn) => {
    if (!menu) return;
    setColumnFilterAt({ column, left: menu.left, top: menu.top });
    setMenu(null);
  };

  // Like the model-driven grid: the page header, command bar and column headers stay put and only the
  // rows scroll. The whole page fits the window (user choice): the rows box takes the height left
  // after what's above it and what sits under it (pager, card and page padding).
  useLayoutEffect(() => {
    const box = gridScrollRef.current;
    if (!box) return;
    const fit = () => {
      // Measure at natural height, so a short list never stays capped from an earlier, smaller fit.
      const previous = box.style.maxHeight;
      box.style.maxHeight = 'none';
      const rect = box.getBoundingClientRect();
      const page = box.closest('.content') ?? box.parentElement ?? box;
      const below = page.getBoundingClientRect().bottom - rect.bottom;
      box.style.maxHeight = previous;
      const top = rect.top + window.scrollY;
      const next = Math.max(MIN_GRID_HEIGHT, Math.floor((window.innerHeight - top - below) / cssZoom(box)));
      setGridMaxHeight((current) => (current === next ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (box.parentElement) observer.observe(box.parentElement);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [rows.length, columns.length]);

  return (
    <>
      {/* Command bar */}
      <div className="filter-bar grid-cmdbar" style={{ alignItems: 'center', gap: 8 }}>
        {/* Buttons follow the user's privileges on this table, as in the model-driven command bar. */}
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={onNewRecord}>
            <Add size={14} color="currentColor" /> New
          </button>
        )}
        {canWrite && (
          // One record: open its form; several: edit them together (model-driven "Edit").
          <button
            type="button"
            className="btn btn-outline"
            disabled={!selected.length}
            onClick={() => (selected.length === 1 ? onOpenRecord(selected[0], pageIds) : setRecordDialog('bulk-edit'))}
          >
            <Edit2 size={14} color="currentColor" /> Edit
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={() => setPendingAction('delete')}>
            <Trash size={14} color="currentColor" /> Delete
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={refresh} disabled={records.loading}>
          <Refresh size={14} color="currentColor" /> Refresh
        </button>
        {canWrite && (
          <>
            <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={() => setPendingAction('activate')}>
              <TickCircle size={14} color="currentColor" /> Activate
            </button>
            <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={() => setPendingAction('deactivate')}>
              <CloseCircle size={14} color="currentColor" /> Deactivate
            </button>
          </>
        )}
        {canAssign && (
          <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={() => setRecordDialog('assign')}>
            <Profile2User size={14} color="currentColor" /> Assign
          </button>
        )}
        {canShare && (
          <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={() => setRecordDialog('share')}>
            <Share size={14} color="currentColor" /> Share
          </button>
        )}
        <button type="button" className="btn btn-outline" disabled={!selected.length} onClick={emailLink}>
          <Sms size={14} color="currentColor" /> Email a Link
        </button>
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn btn-outline" disabled={exporting || !rows.length} aria-expanded={exportOpen} onClick={() => setExportOpen((open) => !open)}>
            <DocumentDownload size={14} color="currentColor" /> {exporting ? 'Exporting…' : 'Export to Excel'} ▾
          </button>
          {exportOpen && (
            <div className="ss-list open" role="menu" style={{ width: 240, zIndex: 300 }}>
              <div className="ss-row" role="menuitem" tabIndex={0} onClick={() => void runExport('all')}>Static Worksheet (all pages)</div>
              <div className="ss-row" role="menuitem" tabIndex={0} onClick={() => void runExport('page')}>Static Worksheet (page only)</div>
            </div>
          )}
        </div>
        {selected.length > 0 && <span className="sbadge sbadge-gold">{selected.length} selected</span>}
      </div>

      {/* View picker + filters + columns + keyword search */}
      <div className="filter-bar grid-viewbar" style={{ alignItems: 'center' }}>
        <div className="form-field" style={{ minWidth: 260, marginBottom: 0 }}>
          <label className="field-lbl sr-only" htmlFor={`view-${table.logicalName}`}>View</label>
          <Dropdown
            id={`view-${table.logicalName}`}
            value={view.id}
            onChange={onChooseView}
            options={[
              { label: 'My Views', items: views.filter((option) => option.personal) },
              { label: 'System Views', items: views.filter((option) => !option.personal) },
            ].flatMap((group) =>
              group.items.map((option) => ({
                value: option.id,
                group: group.label,
                label: `${option.name}${option.id === userDefaultViewId ? ' (default)' : option.region && option.region === region ? ` (${REGION_LABEL[option.region]})` : ''}`,
              })),
            )}
          />
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setFilterOpen(true)}>
          <Filter size={14} color="currentColor" /> Edit filters{filterModified ? ' •' : ''}
        </button>
        {filterModified && (
          <button type="button" className="btn btn-ghost" onClick={clearAllFilters} title="Back to the view's own filter">
            <FilterRemove size={14} color="currentColor" /> Clear filters
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={() => setPickerOpen(true)}>
          <RowVertical size={14} color="currentColor" /> Edit columns{prefs.columns || prefs.widths ? ' •' : ''}
        </button>
        <form
          className="search-select"
          role="search"
          style={{ marginInlineStart: 'auto', minWidth: 240 }}
          onSubmit={(event) => {
            event.preventDefault();
            setSearchText(searchDraft.trim());
            resetPage();
          }}
        >
          <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
          <input
            className="field-input"
            placeholder="Search this view"
            aria-label="Search this view"
            title={`Searches: ${searchAttributes.map((name) => columnMeta(table.logicalName, name)?.label ?? name).join(', ')}. Starts with the text; use * first (e.g. *abc) to match anywhere.`}
            value={searchDraft}
            dir="auto"
            onChange={(event) => setSearchDraft(event.target.value)}
          />
          {searchText && (
            <button type="button" className="cs-clear" aria-label="Clear search" onClick={() => { setSearchDraft(''); setSearchText(''); resetPage(); }}>
              ×
            </button>
          )}
        </form>
      </div>

      {records.loading && (
        <div className="loader-box" role="status">
          <div className="loader-ring" />
          <div className="loader-text">Loading records…</div>
        </div>
      )}
      {records.error && (
        <div className="empty-state" role="alert">
          <div className="empty-title">Couldn’t load data</div>
          <div className="empty-sub" dir="auto">{records.error}</div>
          <button type="button" className="btn btn-primary" onClick={refresh}>Try again</button>
        </div>
      )}
      {records.data && rows.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">No records</div>
          <div className="empty-sub">{searchText || filterModified ? 'Nothing matches the current search or filters.' : 'This view has no records to show.'}</div>
        </div>
      )}
      {records.data && rows.length > 0 && (
        <>
          <div ref={gridScrollRef} className="grid-scroll" style={{ maxHeight: gridMaxHeight }}>
            {/* Fixed layout: each column is exactly its width; wider than the box = horizontal scroll. */}
            <table className="req-table" style={{ tableLayout: 'fixed', minWidth: 40 + columns.reduce((sum, column) => sum + column.width, 0) }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allSelected}
                      onChange={() => setSelection({ key: selectionKey, ids: allSelected ? [] : pageIds })}
                    />
                  </th>
                  {columns.map((column) => {
                    const sorted = effectiveSort?.attribute === column.name ? effectiveSort.descending : null;
                    return (
                      <th key={column.name} style={{ width: column.width, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        <button
                          type="button"
                          aria-haspopup="menu"
                          title={column.label}
                          style={{ ...linkStyle, color: 'inherit', textDecoration: 'none', textTransform: 'inherit', letterSpacing: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}
                          onClick={(event) => openMenu(column, event.currentTarget)}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{column.label}</span>
                          {filteredColumns.has(column.name) && <Filter size={12} color="currentColor" variant="Bold" aria-label="Filtered" className="col-filtered-icon" />}
                          {/* Sort direction (like the MDA: arrow up = A to Z, down = Z to A); the menu chevron shows on hover. */}
                          {sorted === false && <ArrowUp size={13} color="currentColor" aria-label="Sorted A to Z" className="col-sort-icon" />}
                          {sorted === true && <ArrowDown size={13} color="currentColor" aria-label="Sorted Z to A" className="col-sort-icon" />}
                          <ArrowDown2 size={12} color="currentColor" aria-hidden="true" className="col-menu-chevron" />
                        </button>
                        <span
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${column.label}`}
                          title="Drag to resize · double-click to reset"
                          {...resizeHandlers(column)}
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={() => resetWidth(column.name)}
                          style={{
                            position: 'absolute', top: 0, bottom: 0, insetInlineEnd: 0, width: 7, cursor: 'col-resize', touchAction: 'none',
                            borderInlineEnd: `2px solid ${resizing?.name === column.name ? 'var(--gold-dark)' : 'var(--border)'}`,
                          }}
                        />
                      </th>
                    );
                  })}
                  {/* Filler column absorbs spare width so the others keep exactly the width set for them. */}
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const id = rowId(row);
                  return (
                    <tr
                      key={id ?? index}
                      tabIndex={id ? 0 : undefined}
                      aria-selected={id ? selected.includes(id) : undefined}
                      // Like the model-driven grid: a click selects the row (Ctrl / ⌘ adds to the
                      // selection), a double-click opens the record.
                      onClick={id ? (event) => (event.ctrlKey || event.metaKey ? toggle(id) : setSelection({ key: selectionKey, ids: [id] })) : undefined}
                      onDoubleClick={id ? () => { window.getSelection()?.removeAllRanges(); onOpenRecord(id, pageIds); } : undefined}
                      onKeyDown={(event) => {
                        if (id && event.key === 'Enter') onOpenRecord(id, pageIds);
                      }}
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        {id && <input type="checkbox" aria-label="Select row" checked={selected.includes(id)} onChange={() => toggle(id)} />}
                      </td>
                      {columns.map((column, columnIndex) => {
                        const text = formatCell(row, column);
                        const link = cellLink(row, column);
                        const target = lookupTarget(row, column);
                        const related = target ? findTable(target.table) : undefined;
                        return (
                          <td
                            key={column.name}
                            className={columnIndex === 0 ? 'req-name' : undefined}
                            title={text || undefined}
                            // One line per row like the model-driven grid; full text in the tooltip.
                            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {/* <bdi> keeps Arabic text in the right direction without changing column alignment. */}
                            {link ? (
                              <a href={link} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(event) => onFileLinkClick(event, link, text)}>
                                {text}
                              </a>
                            ) : text && target && related ? (
                              <button
                                type="button"
                                style={linkStyle}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenRelated({ table: related.table, label: related.label, id: target.id });
                                }}
                              >
                                <bdi>{text}</bdi>
                              </button>
                            ) : text ? (
                              <bdi>{text}</bdi>
                            ) : (
                              <span className="req-dim">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td aria-hidden="true" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <div className="page-info">
              Page <b>{page}</b> · <b>{firstRow.toLocaleString()}–{(firstRow + rows.length - 1).toLocaleString()}</b>
              {total !== null && (
                <>
                  {' '}of <b>{total >= 5000 ? '5,000+' : total.toLocaleString()}</b>
                </>
              )}
            </div>
            {paged.pageable && (
              <div className="pagination-controls">
                <button type="button" className="btn btn-outline btn-sm" aria-label="First page" disabled={page === 1} onClick={() => setPage(1)}>
                  <span className="pg-arrow">«</span>
                </button>
                <button type="button" className="btn btn-outline btn-sm" aria-label="Previous page" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>
                  <span className="pg-arrow">‹</span>
                </button>
                <button type="button" className="btn btn-outline btn-sm" aria-label="Next page" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>
                  <span className="pg-arrow">›</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {menu && (
        <ColumnMenu
          key={menu.column.name}
          anchor={menu}
          sortedDescending={effectiveSort?.attribute === menu.column.name ? effectiveSort.descending : null}
          canMoveLeft={menuIndex > 0}
          canMoveRight={menuIndex >= 0 && menuIndex < columnNames.length - 1}
          width={menu.column.width}
          onSort={(descending) => {
            setSort({ attribute: menu.column.name, descending });
            resetPage();
            setMenu(null);
          }}
          onFilter={() => openColumnFilter(menu.column)}
          customSorted={sort?.attribute === menu.column.name}
          onClearSort={() => {
            setSort(undefined);
            resetPage();
            setMenu(null);
          }}
          filtered={filteredColumns.has(menu.column.name)}
          onClearFilter={() => {
            clearColumnFilter(menu.column.name);
            setMenu(null);
          }}
          onWidth={(width) => {
            if (width >= MIN_COLUMN_WIDTH && width <= MAX_COLUMN_WIDTH) savePrefs({ ...prefs, widths: { ...prefs.widths, [menu.column.name]: Math.round(width) } });
            setMenu(null);
          }}
          onMove={moveColumn}
          onClose={() => setMenu(null)}
        />
      )}
      {pickerOpen && (
        <ColumnPicker
          current={columns}
          available={[...view.columns, ...availableColumns(table.logicalName).filter((column) => !view.columns.some((own) => own.name === column.name))]}
          customized={prefs.columns !== undefined || prefs.widths !== undefined}
          onApply={(names) => {
            setColumnOrder(names);
            setPickerOpen(false);
          }}
          onReset={() => {
            savePrefs({});
            setPickerOpen(false);
            resetPage();
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {filterOpen && (
        <FilterEditor
          tableLabel={tableLabel}
          tableLogicalName={table.logicalName}
          tableEntitySet={table.entitySet}
          fields={filterFields}
          current={{ ...(filter ?? viewFilter), items: [...(filter ?? viewFilter).items, ...columnConditions] }}
          viewDefault={viewFilter}
          onApply={(next) => {
            // The column filters are part of the edited tree now.
            setFilter(next);
            setColumnFilters({});
            setFilterOpen(false);
            resetPage();
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {columnFilterAt && (
        <ColumnFilterPopover
          key={columnFilterAt.column.name}
          tableLogicalName={table.logicalName}
          tableEntitySet={table.entitySet}
          column={columnFilterAt.column}
          left={columnFilterAt.left}
          top={columnFilterAt.top}
          current={columnFilters[columnFilterAt.column.name]}
          onApply={(condition) => {
            setColumnFilters((prev) => ({ ...prev, [condition.attribute]: condition }));
            setColumnFilterAt(null);
            resetPage();
          }}
          onClear={() => {
            clearColumnFilter(columnFilterAt.column.name);
            setColumnFilterAt(null);
          }}
          onClose={() => setColumnFilterAt(null)}
        />
      )}
      {recordDialog === 'bulk-edit' && (
        <BulkEditDialog
          table={table}
          label={tableLabel}
          ids={selected}
          notify={notify}
          onClose={() => setRecordDialog(null)}
          onDone={() => { setRecordDialog(null); refresh(); }}
        />
      )}
      {recordDialog === 'assign' && (
        <AssignDialog table={table} ids={selected} notify={notify} onClose={() => setRecordDialog(null)} onDone={() => { setRecordDialog(null); refresh(); }} />
      )}
      {recordDialog === 'share' && (
        <ShareDialog table={table} ids={selected} notify={notify} onClose={() => setRecordDialog(null)} onDone={() => setRecordDialog(null)} />
      )}
      {pendingAction && (
        <ConfirmDialog
          title={pendingAction === 'delete' ? 'Confirm Deletion' : pendingAction === 'activate' ? 'Confirm Activation' : 'Confirm Deactivation'}
          message={
            pendingAction === 'delete'
              ? `Do you want to permanently delete ${selected.length} selected record${selected.length === 1 ? '' : 's'}? You can't undo this action.`
              : `Do you want to ${pendingAction} ${selected.length} selected record${selected.length === 1 ? '' : 's'}?`
          }
          confirmLabel={pendingAction === 'delete' ? 'Delete' : pendingAction === 'activate' ? 'Activate' : 'Deactivate'}
          danger={pendingAction !== 'activate'}
          busy={busy}
          onConfirm={() => void runBulk(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}
