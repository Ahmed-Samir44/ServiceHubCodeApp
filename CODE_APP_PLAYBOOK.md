# Power Apps Code App on Dataverse — Playbook

Everything learned building **ServiceHub** (a Power Apps code app that replaced a model-driven app's table pages and a legacy D365 HTML web resource), written so the next system can be built the same way without repeating the journey. Each rule says what to do and why.

Use it as the brief for a new project: copy the architecture, the data layer, the security model, the MDA-parity checklist, the design system and the working rules. The ServiceHub repo is the reference implementation; file paths below point into it.

---

## 1. Stack and project setup

| Part | Choice |
| --- | --- |
| App type | Power Apps **Code App** (React SPA hosted by the Power Apps player) |
| UI | React 19, TypeScript strict, Vite 7 |
| Power Apps SDK | `@microsoft/power-apps` 1.2.x, Vite plugin `@microsoft/power-apps-vite` |
| CLI | `@microsoft/power-apps-cli` as a devDependency, run as `./node_modules/.bin/pa` (a global `pac` may be an unrelated tool) |
| Data | Generic Dataverse connector (`shared_commondataserviceforapps`), OAuth (each user's own connection) |
| Icons | `iconsax-react` |
| Rich text editor | TipTap 3 (StarterKit, table, text-align, text-style), sanitised with DOMPurify |
| Excel export | `write-excel-file`'s **synchronous** generator (`generateXlsxFileSync`, fflate `zipSync`), loaded on demand. The public entry zips with async `zip`, which runs on Web Workers, and the code app's CSP (`worker-src 'none'`) blocks them: the export hangs forever on "Exporting…". The sync module isn't in the package's exports map, so it's aliased in `vite.config.ts` (`write-excel-file-sync`) and declared in `src/env.d.ts`. Test exports under `worker-src 'none'`. |
| Fonts | `@fontsource/urbanist` (UI), `@fontsource/jetbrains-mono` (codes, IBANs) |

Commands:

```text
npm run dev                      # Local Play: open the Local Play link the CLI prints (port fixed in vite config)
npx tsc -b --noEmit              # type check
npx eslint src                   # lint (react-hooks, react-refresh rules on)
npm run build                    # tsc -b && vite build
./node_modules/.bin/pa app push --solution-id <solution guid>   # publish into a solution
```

Rules:

- **No `any`.** Strict TypeScript everywhere.
- **Never hand-edit generated files** (`src/generated/**`, `.power/schemas/**`). Change data sources with `pa app add|remove data-source`.
- **Push into a solution** (`--solution-id`), so the app is exported and moved with it. Without it, the first push lands in the environment's default solution.
- **Code-split the shell:** lazy-load the big screens (`React.lazy` for the hub screen and the table screen) and dynamic-import heavy libraries (Excel writer). The main chunk dropped from ~990 kB to ~470 kB.
- Asset paths are relative (`./assets/…`, set by the Power Apps Vite plugin), so lazy chunks load inside the player.

---

## 2. Environments (cross environment)

The app and the data can live in different environments. ServiceHub:

| Environment | Role |
| --- | --- |
| App host (org998df960) | The code app is installed here; users need the app **shared** with them here |
| Dev data ("DT New", org319b4ea9) | Development and testing |
| Live data (org2f45e702) | Production data and the real security roles |

How it works:

- Every Dataverse call uses the connector's `*WithOrganization` operations with the data org URL (`ListRecordsWithOrganization(orgUrl, entitySet, prefer, …, fetchXml, top)`, `CreateRecordWithOrganization`, `UpdateRecordWithOrganization`, `DeleteRecordWithOrganization`, `PerformUnboundActionWithOrganization`).
- **One place for the org:** `src/data/config.ts` holds `DATA_ORG_URL` and `MDA_APP_ID` (the model-driven app whose views to mirror). Both read an optional override from `.env.development.local` (`VITE_DATA_ORG_URL`, `VITE_MDA_APP_ID`), which only `npm run dev` reads. So Local Play can point at dev while the published build points at live, or the reverse, with no risk of shipping the wrong one.
- After switching, check the built bundle contains only the intended org (`grep -l <org> dist/assets/*.js`).
- `pa app add data-source --org-url` only reads a schema; the service still targets the home environment. Cross environment must go through the generic connector with the org parameter.

Cross-environment consequences to plan for:

- **Licences:** the Dataverse connector is premium. Confirm users' licences cover a code app running from another environment. The first end-user test answers it: if they open the app normally, it's covered.
- **Security group:** if the app environment has one, users must be members.
- **Security roles** always come from the data environment.

---

## 3. Data layer

Files: `src/data/dataverse.ts` (gateway), `src/data/views.ts`, `src/data/columnMeta.ts`, `src/data/lookups.ts`, `src/data/forms.ts`, `src/data/records.ts`, `src/data/fetchQuery.ts`.

### 3.1 Gateway

- One swappable gateway (`list / create / update / remove / action`), so a dev preview can run on canned data (see §9).
- `Prefer: odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.*"` on every read. With it, lookup names, choice labels and formatted dates come back ready, and no client-side resolving is needed.
- Reads use **FetchXML** (views are FetchXML anyway). Paging: `page` / `count` on the `<fetch>`, `@Microsoft.Dynamics.CRM.morerecords`; total from `returntotalrecordcount` (capped at 5000).
- `@odata.nextLink` from the connector is a connector URL, so page with FetchXML, not nextLink.
- The connector also accepts **metadata and function paths** as the entity set, which was the key discovery:
  - `EntityDefinitions(LogicalName='<table>')/Attributes`
  - `EntityDefinitions(LogicalName='<table>')/ManyToOneRelationships`
  - `EntityDefinitions(LogicalName='<table>')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata`
  - `EntityDefinitions` with `$filter=LogicalName eq '<table>'`
  - `WhoAmI`
  - `systemusers(<id>)/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`
  Functions answer with an object, not a `value` list: read `result.data` directly.

### 3.2 Column metadata (live, like the MDA)

- Ship a **snapshot** of each table's columns (generated by `scripts/build-column-labels.mjs` from saved schema JSON into `src/data/columnLabels.generated.ts`: label, kind, choice options, required, read-only, max length, lookup schema name).
- **At runtime, read the table's columns live** before rendering its grid or form, from `EntityDefinitions(LogicalName=…)/Attributes` with `$select=LogicalName,AttributeType,SchemaName,DisplayName,RequiredLevel,IsValidForCreate,IsValidForUpdate,AttributeOf`.
  - Skip companion attributes (`AttributeOf` set).
  - Map `AttributeType` to the kind: Lookup / Owner / Customer → lookup; Picklist / State / Status / Boolean → choice; DateTime → date; Memo → memo; Integer / BigInt / Decimal / Double / Money → number; String → text.
  - The lookup's **SchemaName** is the `@odata.bind` navigation property (e.g. `cr18c_Employee`). Without it a lookup must be read-only.
- **Merge:** add only the columns the snapshot lacks (new columns), so existing columns keep the snapshot's fuller data (choice options).
- **Fallback:** the connector's "get a row" schema (`GetMetadataForGetEntityWithOrganization`). It has Web API keys and titles but **no Dataverse types**: lookups appear as `_x_value` titled "X (Value)". After that, the snapshot.
- **Cap the wait** (6 s) so a slow metadata call never blocks the page, and skip it in the dev preview.
- Result: a column added later (the new Employee lookup) appears in views and forms with its label and editor, with no rebuild.

### 3.3 Views (exactly the MDA's)

- System views: `savedqueries` with `returnedtypecode eq '<table>' and querytype eq 0 and statecode eq 0`; personal views: `userqueries` (same filter; optional).
- **Only the views the model-driven app includes:** read `appmodulecomponent` rows with `componenttype = 26` linked to `appmodule` where `appmoduleid = MDA_APP_ID`. If the app lists any view of the table, show only those; if it lists none, show all (the MDA's rule). On failure show all.
- Columns from `layoutxml` (`<cell name width>`, skip `ishidden`), order and filters from `fetchxml`.
- Pick the default view per region by name (views named with EGY / KSA), else `isdefault`.
- Quick Find columns: the Quick Find view (`querytype eq 4`), the `<filter isquickfindfields="1">` conditions.

### 3.4 Lookups (exactly the MDA's)

- **Target table:** from the record's `_x_value@Microsoft.Dynamics.CRM.lookuplogicalname`. If the record is empty, take any record with the lookup set. If no record has a value (a brand-new column), use `ManyToOneRelationships` (`ReferencingAttribute eq '<attr>'` → `ReferencedEntity`), then the lookup's `Targets`.
- **Target table info** (entity set, primary name): from `EntityDefinitions` (`EntitySetName`, `PrimaryNameAttribute`), with known tables as a shortcut.
- **Search like the MDA:**
  - Run it through the target's **Lookup View** (`savedqueries`, `querytype eq 64`, the default one). Use its FetchXML **filters and sort**, so inactive or incomplete rows the MDA hides stay hidden.
  - Add an OR of `like %text%` conditions on the target's **Quick Find** text columns.
  - Use `top="15"`.
- **Display like the MDA:** the primary name, with the Lookup View's next **two columns in view order** under it. Show `(No name)` when the primary name is empty. Don't invent extras: no reordering, and keep symbols the data really contains.
- Saving: `"<SchemaName>@odata.bind": "/<entityset>(<id>)"`; clearing: `null`.

### 3.5 Forms

- The main form from `systemforms` (formxml): tabs → sections → fields; subgrids with their view and relationship.
- Rich text columns are listed explicitly (`src/data/richTextColumns.ts`); they're rendered sanitised and edited with TipTap.
- Lookup navigation for `@odata.bind` comes from metadata (§3.2).

---

## 4. Security (who sees which button)

Files: `src/data/permissions.ts`, `src/app/PermissionsProvider.tsx`.

**Principle:** the code app uses the users' existing security roles. Dataverse enforces them on every request (the connection is the user's own, OAuth). The app only **hides** what the user can't use.

How the app reads privileges, in order:

1. `WhoAmI` → `UserId`.
2. `systemusers(<UserId>)/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()` → `RolePrivileges[].PrivilegeName` (e.g. `prvWritecr301_coelist`).
   - Any user may ask for their own privileges, so no read access to security roles is needed.
   - It includes roles held through teams.
3. Fallback only: FetchXML over `privilege` ↔ `roleprivileges` ↔ `role` (root role via `parentrootroleid`) ↔ `systemuserroles`, plus the same through `teamroles` / `teammembership`. This needs read access on roles, so it fails for narrow custom roles.
4. If both fail: show every button and let Dataverse refuse. Never treat a failed check as permission to bypass Dataverse.

What each privilege shows:

| Privilege on the table | UI |
| --- | --- |
| Read | The table in the sidebar; records open |
| Create | New, Save & New |
| Write | Save, Save & Close, Deactivate / Activate, editable fields |
| Delete | Delete |
| Assign | Assign |
| Share | Share |
| No Write | The record opens read-only with "Read-only: you don't have permission to edit this record" |

Rules and limits:

- **Check privileges, never role names.** Role names break on renames and new roles. Legacy roles like "Service Hub APP - Edit COE" or "Read All" map to table privileges and just work.
- **Show or hide anything not tied to a table** (a page, a feature) with a **marker table**: an empty table, say "App Access - Reports", with Read granted only to the roles that should see it; the app checks `prvRead<markertable>`.
- **Deactivate = Write.** Dataverse has no separate privilege; blocking deactivate for editors needs a plugin.
- **User-level depth:** with Write on own records only, a table-level check still shows buttons on others' records (Dataverse refuses the save). Per-record hiding needs `RetrievePrincipalAccess` for the record.
- **Proof:** an end user with fewer privileges opened the app on live; the buttons they had no privilege for didn't appear.

Giving a user access: a role in the **data** environment + the app **shared** in the **app** environment (a security group is easiest) + licence + app-environment security group membership if any. On first open the user approves the connection once.

---

## 5. Model-driven parity checklist (table pages)

The rule from the user: **"everything like the model-driven app."** Before calling a feature done, compare it to the MDA.

Sidebar:

- Built from the MDA **sitemap** (groups → tables); a table hides when the user lacks Read.
- **Sections fold and unfold** (click the group label; chevron rotates; folded groups remembered in localStorage per browser).

Grid (`src/screens/grid/ViewGrid.tsx`):

- View picker with region default; "Active records" only when no view.
- **Fixed top, scrolling rows:** the page header, command bar, view bar and column headers stay put; only the rows scroll, inside a box sized to the window height left (`grid-scroll`, measured against the page content, not the document, since the sidebar can be taller; sticky `thead th`, with no inline `position` on header cells or sticky breaks). The pager stays visible under it.
- **Rows:** a click selects the row (highlighted, checkbox ticked; Ctrl / ⌘ adds to the selection), a **double-click opens the record**, Enter opens it too. Same in form subgrids.
- **Quick Find** search box on the Quick Find columns.
- Column header menu: Sort A→Z / Z→A, **Clear sort**, Filter by, **Clear filter**; sort arrows (↑↓), chevron on hover.
- **Columns from related tables** (a view's link-entity columns, e.g. "Doctor Name Ar (Doctor Name)") sort and filter too, like the MDA: the `<order>` goes inside the matching `<link-entity>` (by alias), conditions carry `entityname="<alias>"`, and a linked lookup column offers only "contains data / does not contain data".
- Column filters like the MDA:
  - Operators per type.
  - **Lookup "Equals" is a record picker** (multi-select → `in` / `not-in`).
  - Filters combine with the view's own.
- **Edit filters** side panel (820px):
  - **One row per condition:** field | operator | value | 🗑.
  - And/Or groups, Reset to default, Delete all filters.
- Export to Excel → Static Worksheet (all pages / page only):
  - **Typed cells:** numbers stay numbers, dates stay dates.
  - Choices and lookups as names.
  - **Rich text as readable text** (paragraphs, line breaks, bullets kept, wrapped cell), capped at Excel's 32,767 characters.
- Column picker: display names only (**never show logical names**).
- Bulk edit, delete, assign, share, activate / deactivate on selection, each gated by privilege.
- Page header: the view name + the table name in a pill (`.table-pill`); no logical name.

Form (`src/screens/RecordForm.tsx`):

- Tabs, sections, subgrids, lookups, rich text, required markers, read-only fields.
- Commands: Save, Save & Close, Save & New, Deactivate / Activate, Delete, Assign, Share, Refresh, Close, previous / next record.
- **Sticky header:** the title, command bar and tabs stay on top while the body scrolls, for every long dialog (`.detail-modal-box > .modal-hdr { position: sticky }`).
- Unsaved-changes badge and leave guard.

---

## 6. Rebuilding a legacy web resource (hub pages)

Rules learned porting the D365 HTML page:

- **Read the matching legacy function before building a page.** Keep its logic, fields and wording; don't port its bugs.
- **Keep every legacy field with its label** on cards. Icons-only cards were rejected.
- **Any field may be rich text (HTML):** render it sanitised and formatted, with `dir="auto"` on lists and paragraphs so bullets sit on the side of their own language.
- **Same flow, iframe → pop-up:** a section of buttons, one per record; a click shows the record's link. The only change from legacy is where the link opens (§7). Don't add multi-link choosers or "Open document" buttons the legacy page didn't have.
- **Usage log like legacy:** one row per screen opened in the legacy log table, with the **legacy screen id** as the page name (`doctorsScreen`, `egyInsuranceScreen`, `doctorProfileScreen`, `clinicHubScreen`…), the user's domain name (required primary column) and full name, and the time the screen opened.
  - Fire-and-forget: never block or break the UI.
  - Skipped in development, so tests don't fill the log.
- **Cross links like legacy:** e.g. clinic names on doctor cards open that clinic's hub (a "preset" carried into the target section).
- **Region logic** (Egypt / KSA) from choice values; sections can exist in one region only.
- **Data checks before blaming code:** when a page shows nothing, read every column of the table raw (`<all-attributes/>`) in a temporary Local Play-only debug box, and compare with the MDA. In ServiceHub the "missing" Working Hours turned out to be 22 inactive duplicates with no region, plus a re-import without the Iframe URL column.

---

## 7. Files and links: no iframes

**Rule: no iframes anywhere.** Two walls make every external frame fail on the published app:

1. **The code app's CSP:** `frame-src 'self'`, `img-src 'self' data:`, `connect-src 'none'` by default. An admin can extend it per environment.
2. **SharePoint's `frame-ancestors`:** it allows `*.dynamics.com`, `*.powerapps.com`, Teams and Office, but **not** the code app's own host (`*.environment.api.powerplatformusercontent.com`). Every ancestor is checked, so hosting the app inside Dynamics or a "Master Shell" code app doesn't help. Even Teams embedding of code apps hits this.

Also learned:

- **Sensitivity labels with encryption** ("Internal Use") make downloaded Office files unreadable to the app (OLE container `D0 CF 11 E0`). SharePoint PDF conversion, preview and v2 APIs through the SharePoint connector answer 400 "Unexpected response"; only classic `_api/web/...` works there.
- The **Excel Online connector** needs edit rights on the file, and designed sheets are shapes, not tables. It isn't a viewer.
- External images are blocked by the CSP: **bundle images** in the app (`src/assets/…`) instead of hot-linking.

What to do instead (`src/data/fileLinks.ts`):

- Every document link opens in a **pop-up window**, centred at **85% of the screen**:
  - `window.open('', name, 'popup=yes,width,height,left,top')`.
  - **One window per link:** reopening a link focuses its window, and a new link cascades by 32px.
  - The opener is cleared.
  - It falls back to a new tab if pop-ups are blocked.
- Office documents open in **Office Online embed view**: `Doc.aspx` / sharing links get `action=embedview`, direct file paths go through `WopiFrame.aspx?sourcedoc=…&action=embedview`, plus `wdHideHeaders=True&wdHideGridlines=True`. That gives no ribbon and no row or column headers.
- The pop-up's first "Opening…" screen is painted **app-styled**: the teal header with the logo, the file name, and a spinner.
- System links and maps open in a new tab; link cells in grids and forms route SharePoint documents to the pop-up.
- A record with no link shows its button **disabled** with "No link yet", so missing data is visible.

---

## 8. Design system

Base: the Synapse design tokens (teal system lane), applied as a layer over the base styles, everything scoped under `.servhub-app` (**no global selectors**: they leak into the Power Apps player). CSS load order: `tokens.css` → `base.css` → `app.css` → `synapse.css` → component sheets.

### 8.1 Tokens

```css
.servhub-app {
  /* System lane (teal) */
  --ds-color-primary: #126e5c;
  --ds-color-primary-deep: #023635;
  --ds-color-primary-soft: #d9f8ec;
  --ds-color-primary-mint: #40ffb8;
  --ds-color-primary-line: rgba(18, 110, 92, .14);
  --ds-color-primary-50: #f0faf7;  --ds-color-primary-100: #d9f3ea; --ds-color-primary-200: #b7e7d7;
  --ds-color-primary-300: #82d2ba; --ds-color-primary-400: #4bb69a; --ds-color-primary-500: #278f76;
  --ds-color-primary-600: #126e5c; --ds-color-primary-700: #0d594b; --ds-color-primary-800: #0a463c;
  --ds-color-primary-900: #073a33;

  /* Analytics (gold) and AI (purple) lanes: reserved, not for normal features */
  --ds-color-analytics: #c99b3b;  --ds-color-ai: #8d73de;

  /* Status tones */
  --ds-status-success-text: #176148; --ds-status-success-bg: rgba(64, 255, 184, .2);
  --ds-status-high-text: #8f5c0d;    --ds-status-high-bg: rgba(255, 225, 160, .55);
  --ds-status-urgent-text: #a23e3e;  --ds-status-urgent-bg: rgba(255, 196, 196, .55);
  --ds-status-draft-text: #67736f;   --ds-status-draft-bg: rgba(211, 218, 216, .75);
  --ds-status-info-text: #185c67;    --ds-status-info-bg: rgba(185, 230, 235, .4);
  --ds-color-danger: #dc2626;        --ds-color-danger-soft: #fef2f2;

  /* Surfaces & text */
  --ds-color-surface-raised: #ffffff;   --ds-color-surface-muted: #f5f7f6;
  --ds-color-surface-selected: #eff8f4; --ds-color-surface-overlay: rgba(3, 17, 15, .58);
  --ds-color-text-primary: #263037;     --ds-color-text-secondary: #4d5860; --ds-color-text-muted: #737981;
  --ds-color-border: rgba(79, 81, 96, .14); --ds-color-border-strong: rgba(26, 74, 66, .2);

  /* Type, radius, shadow, motion */
  --ds-font-family: 'Urbanist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  --ds-radius-control: 8px; --ds-radius-tag: 4px; --ds-radius-card: 16px;
  --ds-shadow-dialog: 0 20px 25px -5px rgba(0, 0, 0, .1), 0 8px 10px -6px rgba(0, 0, 0, .1);
  --ds-focus-ring: 0 0 0 3px rgba(18, 110, 92, .18);
  --ds-ease-settle: cubic-bezier(.16, 1, .3, 1); --ds-duration-fast: 180ms;

  /* Shell */
  --ds-shell-nav: radial-gradient(420px 260px at 0% 0%, rgba(64, 255, 184, .14), transparent 70%),
                  linear-gradient(180deg, #064642 0%, #023635 100%);
  --ds-shell-bg: radial-gradient(980px 760px at -4% 30%, rgba(205, 224, 230, .7) 0%, transparent 68%),
                 radial-gradient(980px 780px at 102% 12%, rgba(55, 111, 82, .14) 0%, transparent 70%), #eef1f4;
}
```

Sizing contract: body 14px; tables 14px with 40px rows; fields 44px; buttons 40px (small 32px); control radius 8px, card radius 16px; teal focus ring. Dark mode redeclares every variable (the dark selector out-ranks the light mapping). **Never hard-code colours:** use the tokens; a colour off the system palette was rejected ("why a colour different from the system").

Text size control (A / A / A) scales the content area with CSS `zoom`; fixed-position menus divide their coordinates by the element's `currentCSSZoom`.

### 8.2 Components the user chose (keep these as the defaults)

**"Band" card** (picked twice; first option for any new card):
- One card per row, full width.
- A deep-teal gradient header holds the title, with white translucent tags.
- Sections sit below as bordered boxes side by side.

```css
.info-card { border: 1px solid var(--border); border-radius: var(--ds-radius-card); background: var(--ds-color-surface-raised);
  overflow: hidden; box-shadow: 0 1px 2px rgba(2,54,53,.04), 0 8px 20px rgba(82,82,100,.06); }
.info-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px;
  background: linear-gradient(90deg, #063b36, #0d594b); }
.info-title { font-size: 17px; font-weight: 700; color: #fff; }
.info-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.info-tag { padding: 3px 11px; border-radius: 999px; background: rgba(255,255,255,.16); color: #fff; font-size: 12.5px; font-weight: 700; }
.info-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; padding: 18px 22px; }
.info-section { padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; }
.info-label { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--text-body); margin-bottom: 6px; }
.info-value { font-size: 15px; color: var(--text-primary); line-height: 1.7; }
/* Foldable variant (legacy folded cards): <details class="info-card info-fold"><summary class="info-head">…, ▼ via summary::after */
```

Bank account variant: Band header (bank icon, name, BU), then the fields as tiles with a pill **Copy / Copied** button for account number and IBAN, then notes in a muted strip. The first BU and bank are auto-selected.

**Filter panel: "Pills"** (every list page):
- A header with "Filters", the **result-count pill** and **Clear All Filters**.
- Every filter as a rounded chip with its label inside.
- **Search at the end of the chips' row** when it fits (Refresh beside it), else on the next line.

```css
.filter-panel { padding: 0; overflow: visible; }
.fp-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--border); }
.fp-clear { margin-left: auto; }
.filter-panel .hub-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 20px 16px; }
.filter-panel .hub-filter { flex-direction: row; align-items: center; gap: 2px; height: 38px; padding: 0 4px 0 14px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--ds-color-surface-raised); }
.filter-panel .hub-filter:hover, .filter-panel .hub-filter:focus-within { border-color: var(--ds-color-primary); }
.filter-panel .hub-filter .field-lbl { margin: 0; white-space: nowrap; font-size: 12px; font-weight: 700; color: var(--muted); }
.filter-panel .hub-filter .field-input, .filter-panel .hub-filter .dd-btn { height: 34px; min-height: 34px; border: none; box-shadow: none; background: transparent; }
.filter-panel .hub-search { order: 10; flex: 1 1 280px; }
.filter-panel .hub-filters > .btn { order: 11; border-radius: 999px; height: 38px; }
/* Result count everywhere */
.hub-count { display: inline-flex; align-items: center; width: fit-content; padding: 4px 12px; border-radius: 999px;
  background: var(--ds-color-surface-selected); border: 1px solid var(--ds-color-primary-line); font-size: 13px; font-weight: 700; color: var(--ds-color-primary-700); }
/* With a filter applied: Clear turns primary and gives one small shake as it enables */
.fp-clear:not(:disabled) { background: var(--ds-color-primary); border-color: var(--ds-color-primary); color: #fff; animation: fpClearNudge .5s ease-in-out 1; }
.fp-clear:not(:disabled):hover { background: var(--ds-color-primary-700); box-shadow: 0 0 0 3px var(--ds-color-primary-line); }
@keyframes fpClearNudge { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-3px) rotate(-1.5deg); }
  40% { transform: translateX(3px) rotate(1.5deg); } 60% { transform: translateX(-2px) rotate(-1deg); } 80% { transform: translateX(2px) rotate(1deg); } }
@media (prefers-reduced-motion: reduce) { .fp-clear:not(:disabled) { animation: none; } }
```

**Section bar: "Segment", centred** (the hub's top navigation): one rounded track on **one line**, centred; the active section is a filled teal pill; it scrolls sideways when narrow.

```css
.hub-nav { display: flex; flex-wrap: nowrap; gap: 2px; width: fit-content; max-width: 100%; margin: 0 auto 16px; overflow-x: auto;
  padding: 4px; background: var(--ds-color-surface-muted); border: 1px solid var(--border); border-radius: 999px; }
.hn-item { display: inline-flex; align-items: center; gap: 6px; flex: none; white-space: nowrap; padding: 8px 8px; border: none;
  border-radius: 999px; background: none; font: 600 13.5px var(--ds-font-family); color: var(--text-body); }
.hn-item:hover { background: var(--ds-color-surface-raised); color: var(--text-primary); }
.hn-item.active { background: var(--ds-color-primary); color: #fff; box-shadow: 0 4px 10px rgba(18,110,92,.25); }
```

Other picks:

- **Doctor card "Split":** a white names block with a teal photo ring (bundled photo), labelled fields, a fee table, and a full-width "Visit Doctor Profile" button. 4 per row by default (2/3/4 switch); it stacks under 440px (container query). The corner radius follows the card radius minus 1px.
- **Doctor profile "Sidebar"** layout. Its fee table is **"Rows"**: per business unit a tinted header, then one line per fee type (label left, amount right, dashed dividers). Narrow side cards never get a sideways scroll bar, so don't put wide tables in them.
- **Page header "Band" (2026-10-04):** every page title is one `PageHeader` component: a rounded deep-teal gradient strip (the Band card colours) with the page's icon in a translucent tile (mint icon), white title, 75% white subtitle; table pages keep the table-name pill (white translucent). Glass card and Accent bar were rejected; the old plain title over a border line was "not nice".
- **Region landing "Map" (2026-10-04):** a rendered glass map disc (a photo-real render the user supplied, bundled in `src/assets/region-disc.jpg`; CSS cannot draw that glass) on a light stage that matches the render's backdrop, edges feathered with a mask. A `mix-blend-mode: color` layer gives it the chosen **"Sage"** hue (primary-700 at 20%), a soft multiply glow sits on each region, and glass teardrop pins (EG / SA) carry glass cards with name, currency and an "Open …" button. Silver (no tint), a minty tint and Emerald were rejected. Phones and the change-region dialog use the Tiles below.
- **Region / scope choice "Tiles"**: two tall cards side by side, each with a gradient mark (EG / SA), the name and code, one hint line, a filled "Open …" pill, and the code as a large faded watermark in the corner. The same tiles, smaller, sit in the change-region dialog, with the current one outlined and labelled "Current region". One column on phones.
- **COE:** one card per row, field pills, empty fields hidden.
- **Back links** look like the light outline button, not pills.
- **Dropdowns:** one custom single-select (`src/screens/Dropdown.tsx`) everywhere, never native `<select>`.
- **Empty states:** icon, title and sub-text; loading uses a ring with a label.
- **Sidebar group toggle:** the label is a button with a chevron that rotates -90° when folded.

---

## 9. Working method (how the user wants to work)

- **Replies:** Egyptian Arabic, short, simple words; avoid jargon or explain it with an analogy. Documents for others in English when asked.
- **Don't pester with questions;** ask only when the decision is genuinely theirs. When uncertain, say so plainly ("I'm sure of the code; not yet tested with a restricted user") instead of overclaiming.
- **Every push needs an explicit OK, every time** ("ارفع" / "push"). One approval doesn't carry over. `git push` is also outward-facing: ask.
- **Pre-push gate:** `tsc -b --noEmit` → `eslint` → `build` → a screenshot check if the UI changed → remove the dev preview → push to the solution → commit.
- **Prove UI changes with screenshots:** Playwright (`playwright-core` + installed Chrome) against `npm run dev` with a temporary dev preview.
  - Copy `reference/dev/DevPreview.ts` to `src/DevPreview.ts` and add `import './DevPreview'` at the top of `main.tsx`.
  - Canned rows go per entity set, and privileges are set to allow-all.
  - **Always remove both afterwards:** Local Play shares the dev server.
  - The mock can't exercise connector-only calls (metadata, functions, SharePoint): test those on Local Play against real data.
- **Redesigns:** offer **2–3 designs in the page itself** with a temporary switcher (one shared store so the choice applies to every page), Band first. Remove the unchosen ones after the pick.
- **Apply changes app-wide:** when asked to change one place, find every place with the same pattern and change them all in the same turn. Don't make the user repeat a request for each screen.
- **Diagnose with data, not guesses:**
  - Add a Local Play-only diagnostic line (`import.meta.env.DEV`) that prints the raw answer.
  - Ask the user to paste it, then remove the diagnostic once solved.
  - Ask the user to check the data in the MDA before assuming code or environment problems.
- **Keep a handoff file** (`HANDOFF.md`) with the plan, decisions and status, updated as work lands, plus project memory for preferences.

Shell tooling lessons (Windows):

- **Bash heredocs and `node -e` mangle backslashes, `$` and backticks** in regexes and template literals. Write a script file, or use the editor tool, for anything with escapes.
- **PowerShell `Get-Content` / `Set-Content` break UTF-8** (mojibake). Edit text files with Node or the editor, never PowerShell.
- Vite reads `.env*` files only at start: restart the dev server after changing them.
- Local Play caches connection references: after adding or removing a data source, fully close and reopen the Local Play tab.

---

## 10. Go-live checklist

1. Import the dev solution (columns, views, forms changed in dev) into live.
2. Set `DATA_ORG_URL` and `MDA_APP_ID` to live in `src/data/config.ts`; check the bundle holds only the live org.
3. Push to the solution; commit; push git (with OK).
4. Share the app in the app environment, preferably with an AAD security group of all users.
5. Confirm with the admin: licences cover the code app (cross environment), the app environment's security group, and roles at the intended depth (Organization for table-wide edit).
6. Test with one end user with fewer privileges: they open the app, and buttons they lack don't appear.
7. Announce the link, or add it to the launcher ("Master Shell").
8. Keep Local Play on dev for further development (`.env.development.local`), so tests never touch live data.

---

## 11. Reference implementation map (ServiceHub)

| Concern | File |
| --- | --- |
| Org and MDA app id | `src/data/config.ts` (+ `src/env.d.ts`) |
| Dataverse gateway | `src/data/dataverse.ts` |
| Live column metadata | `src/data/columnMeta.ts`, snapshot `src/data/columnLabels.generated.ts`, `scripts/build-column-labels.mjs` |
| Views, MDA app views, Quick Find | `src/data/views.ts` |
| Lookups (target, Lookup View search) | `src/data/lookups.ts`, `src/screens/form/FieldEditor.tsx`, `src/screens/grid/LookupValuesPicker.tsx` |
| Privileges | `src/data/permissions.ts`, `src/app/PermissionsProvider.tsx` |
| Grid | `src/screens/grid/*` (ViewGrid, FilterEditor, ColumnMenu, ColumnFilterPopover, BulkEditDialog) |
| Form | `src/screens/RecordForm.tsx`, `src/screens/form/*` |
| Excel export | `src/data/exportExcel.ts` |
| Pop-up file links | `src/data/fileLinks.ts` |
| Usage log | `src/data/usageLog.ts` |
| Shell, sidebar, lazy screens | `src/app/AppShell.tsx`, `src/app/navigation.ts`, `src/app/preferences.ts` |
| Hub pages | `src/screens/ServiceHubScreen.tsx`, `src/screens/hub/*` |
| Shared hub UI (filters, cards, rich text) | `src/screens/hub/HubCommon.tsx`, `src/screens/hub/InfoCard.tsx` |
| Styles | `src/styles/synapse.css` (tokens and overrides), `hub-cards.css`, `doctor-card-styles.css`, `doctor-profile.css`, `app.css` |
| Dev preview (mock) | `reference/dev/DevPreview.ts` |
| Project status | `HANDOFF.md` |
