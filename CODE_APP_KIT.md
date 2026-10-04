# Code App Kit: build a new system with the same design and behaviour

**How to use this file (for the assistant in a new chat):**

1. Read Part 1 (the playbook) completely before writing code. It holds the rules, the decisions the user already made and the mistakes not to repeat.
2. Create the project the way Part 1 §1 says (`pa` CLI, Vite, React, TypeScript), then copy the files in Parts 2–4 to the **same paths**.
3. Change only what belongs to the new system: the org URL and MDA app id in `src/data/config.ts`, the generated data sources (`src/generated`, `.power/schemas` come from `pa`, never hand-edit them), and the pages and tables of the new system. Remove the ServiceHub-only imports from `AppShell.tsx` (the Service Hub screen, regions).
4. Keep the styles exactly (Part 2) so the look is identical: Synapse teal tokens, Urbanist font, Band cards, Pills filters, Segment nav, Tiles.
5. Work with the user as Part 1 §9 says: Egyptian Arabic replies, short and simple; designs offered in the page with a switcher; every push only after an explicit OK.

Generated from the ServiceHub repo (https://github.com/Ahmed-Samir44/ServiceHubCodeApp) by `scripts/build-kit.mjs`. 2026-10-04.

---

# Part 1. Playbook


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
- **Fixed top, scrolling rows:** the page header, command bar, view bar and column headers stay put; only the rows scroll, and **the whole page fits the window** (user choice; no page scroll): the rows box (`grid-scroll`) takes the window height left after what is above it and under it (pager, paddings), measured against the page content, divided by the CSS zoom; the shell is `100vh - top bar` so the page is never taller than the window; sticky `thead th`, with no inline `position` on header cells or sticky breaks). The pager stays visible under it. Table pages are **dense** so the rows get the height: a slim one-line header (`PageHeader compact`), 34px command and view bars, no visible "View" label (screen-reader only), tighter card padding.
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

---

# Part 2. Styles (copy as is)

## Style sheets

Import them in this order in `src/main.tsx`, after the Urbanist (400/500/600/700) and JetBrains Mono (400/600) `@fontsource` imports. Everything is scoped under `.servhub-app` (rename the class if you like, everywhere at once).

### `src/styles/tokens.css`

````css
/* Design tokens — ported verbatim from doctor-new-request.html (:root + .medreq-app.dark) */
/* ServiceHub: only change is the app wrapper class, .medreq-app -> .servhub-app */
:root {
  --brand-gold-600:#2B160A; --gold-dark:#A5845B; --gold-light:#F0C893; --brand-gold:#A5845B;
  --brand-gold-100:#F9F3ED; --green-dark:#49604C; --brand-green:#49604C; --brand-green-700:#2E372D;
  --brand-green-200:#D1E0B1; --brand-green-100:#F5F7F5; --ink:#211C1E; --brand-black:#211C1E;
  --neutral-400:#D9D9D9; --neutral-200:#F7F7F7; --canvas:#F7F4EE; --border:#E8E0D3; --border-hover:#D8CBB4;
  --text-primary:#211C1E; --text-body:#514A44; --muted:#8A8079; --dim:#B3A99E; --danger:#B23A3A;
  --amber-soft:rgba(201,138,30,.12); --gold-soft:rgba(165,132,91,.12); --green-soft:rgba(73,96,76,.12);
  --danger-soft:rgba(178,58,58,.10);
  --grad-gold:linear-gradient(135deg,#A5845B 0%,#F0C893 100%); --grad-green:linear-gradient(135deg,#49604C 0%,#A3B189 100%);
  --grad-nav:linear-gradient(135deg,#2B160A 0%,#211C1E 100%); --grad-sidebar:linear-gradient(160deg,#0D1A0B 0%,#0A150A 100%);
  --grad-card:linear-gradient(180deg,#FFFFFF 0%,#F9F3ED 100%);
  --sidebar-text:rgba(255,255,255,.78); --sidebar-text-active:#FFFFFF; --sidebar-label:rgba(255,255,255,.40); --sidebar-active-bg:rgba(165,132,91,.22);
  --sidebar-ink-base:255,255,255;
  --sans:'Outfit',-apple-system,sans-serif; --body:'Inter',-apple-system,sans-serif; --mono:'JetBrains Mono',monospace;
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:22px;
  --shadow-sm:0 1px 3px rgba(33,28,30,.06); --shadow-gold:0 6px 20px rgba(165,132,91,.22);
}
.servhub-app.dark {
  --canvas: #121212; --text-primary: #fff; --text-body: #aaa; --border: rgba(255,255,255,.1);
  --border-hover: rgba(255,255,255,.2); --neutral-200: #242424; --neutral-400: #444; --brand-black: #fff;
  --grad-card: linear-gradient(180deg,#1e1e1e 0%,#1a1a1a 100%);
  --brand-green-100: #1a221a; --brand-green-200: #2a352a; --brand-gold-100: #2a2218;
  --brand-gold-600: #E8C79A; --gold-dark: #D9B486; --gold-light: #B98F5C;
  --muted: #ADA398; --dim: #9A9187; --danger: #E07575;
  --amber-soft: rgba(230,168,68,.16); --gold-soft: rgba(217,180,134,.16); --green-soft: rgba(163,177,137,.16);
  --danger-soft: rgba(224,117,117,.14);
  --surface-1: #1e1e1e; --surface-2: #242424; --amber-ink: #E6A844;
  --brand-green-700: #B7C9A0;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.4); --shadow-gold: 0 6px 20px rgba(0,0,0,.5);
}
.servhub-app.dark .ro-card, .servhub-app.dark .action-card,
.servhub-app.dark .modal-box, .servhub-app.dark .pick-card, .servhub-app.dark .type-tile, .servhub-app.dark .type-opt,
.servhub-app.dark .dropzone, .servhub-app.dark .patient-result, .servhub-app.dark .ss-list, .servhub-app.dark .toast,
.servhub-app.dark .type-pill button, .servhub-app.dark .cselect .field-input, .servhub-app.dark .attach-row { background: var(--surface-1); border-color:var(--border); }
.servhub-app.dark .field-input, .servhub-app.dark .cselect .field-input { background: rgba(255,255,255,.06); color: #fff; border-color: var(--border); }
.servhub-app.dark .field-input::placeholder { color: var(--dim); }
.servhub-app.dark .field-input:disabled { background: var(--neutral-200); color: var(--muted); }
.servhub-app.dark .req-table th { border-bottom-color: var(--border); color: var(--dim); }
.servhub-app.dark .req-table td { border-bottom-color: var(--border); color: #ddd; }
.servhub-app.dark .req-table tr:hover td { background: rgba(255,255,255,.03); }
.servhub-app.dark .page-hdr { background: linear-gradient(180deg,#181818 0%, #141210 100%); border-bottom-color: var(--border); }
.servhub-app.dark .pick-card:hover, .servhub-app.dark .type-tile:hover, .servhub-app.dark .type-opt:hover, .servhub-app.dark .region-opt:hover,
.servhub-app.dark .dropzone:hover, .servhub-app.dark .dropzone.dragover, .servhub-app.dark .ss-row:hover { background: rgba(217,180,134,.08); }
.servhub-app.dark .pick-card.selected, .servhub-app.dark .type-tile.selected, .servhub-app.dark .type-opt.selected { background: rgba(217,180,134,.12); }
.servhub-app.dark .sbadge-amber { color: var(--amber-ink); }
.servhub-app.dark .pr-src.new { color: var(--amber-ink); }
.servhub-app.dark .btn-outline:hover { background: rgba(255,255,255,.05); }
.servhub-app.dark .wcircle { background: var(--neutral-200); }
.servhub-app.dark .seg-count { background: rgba(255,255,255,.1); }
.servhub-app.dark .empty-icon { background: var(--brand-gold-100); }
.servhub-app.dark .toast { box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.servhub-app.dark .modal-overlay { background: rgba(0,0,0,.6); }
.servhub-app.dark ::selection { background: rgba(217,180,134,.35); color: #fff; }
````

### `src/styles/base.css`

````css
/* Base layout / component styles — ported verbatim from doctor-new-request.html <style> (class names unchanged, so this is a 1:1 visual match) */
/* ServiceHub: only change is the app wrapper class, .medreq-app -> .servhub-app */
/* Scoped to .servhub-app, not global tag selectors or #root — Power Apps Code
   Apps render into the player's own document (no iframe isolation), and the
   player's own mount point also happens to use id="root", so an unscoped
   `*`/`body`/`button`/`#root` reset here bleeds into and corrupts the
   player's own chrome (this is what broke the player's icon font and layout
   across the whole page). .servhub-app is a name we alone own. */
.servhub-app,.servhub-app *,.servhub-app *::before,.servhub-app *::after{box-sizing:border-box;margin:0;padding:0}
/* Cancels the host page's own default <body> margin (8px in Chromium/Firefox)
   without touching body itself — the player's own DOM, not ours, so a global
   body reset would leak into and corrupt the player's chrome (see the note
   above and in App.tsx). Scoped purely to this wrapper. */
.servhub-app{font-family:var(--body);background:var(--canvas);color:var(--text-primary);min-height:100vh;margin-top:-8px;margin-left:-8px}
.servhub-app button,.servhub-app input,.servhub-app select,.servhub-app textarea{font-family:var(--body)}
html,body,.servhub-app,.servhub-app *{scrollbar-width:thin;scrollbar-color:transparent transparent;}
html:hover,body:hover,.servhub-app:hover,.servhub-app *:hover{scrollbar-color:var(--gold-dark) transparent;}
::-webkit-scrollbar {width:6px;height:6px;}
::-webkit-scrollbar-track {background:transparent;}
::-webkit-scrollbar-thumb {background:transparent;border-radius:999px;}
:hover::-webkit-scrollbar-thumb {background:var(--gold-dark);}
:hover::-webkit-scrollbar-thumb:hover {background:var(--brand-gold-600);}

.navbar{height:48px;background:var(--grad-sidebar);display:flex;align-items:center;justify-content:space-between;padding:0 16px;position:sticky;top:0;z-index:200}
.nav-l{display:flex;align-items:center;gap:10px}
.nav-brand{width:30px;height:30px;border-radius:8px;background:var(--grad-gold);display:flex;align-items:center;justify-content:center;font-family:var(--sans);font-weight:800;color:#fff;font-size:13px}
.nav-title{font-family:var(--sans);font-size:13.5px;font-weight:700;color:#fff}
.nav-r{display:flex;align-items:center;gap:10px}
.nav-dot{width:7px;height:7px;border-radius:50%;background:#A3B189}
.nav-user{font-size:11.5px;color:rgba(255,255,255,.85);font-family:var(--sans)}
.nav-avatar{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700}
.region-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:5px 10px 5px 8px;font:600 11.5px var(--sans);color:rgba(255,255,255,.9);cursor:pointer;transition:background .18s,border-color .18s}
.region-chip:hover{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.26)}
.region-chip:active{transform:scale(.97)}
.region-chip .rb-flag{font-size:13px;line-height:1}
.region-chip .rb-chevron{font-size:8px;color:rgba(255,255,255,.5)}
.role-switcher{display:flex;align-items:center;gap:6px}
.role-switcher label{font-size:9.5px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px}
.role-switcher select{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#fff;font:600 11px var(--sans);border-radius:var(--r-sm);padding:4px 8px;cursor:pointer}
.role-switcher select option{color:var(--text-primary)}

.shell{display:flex;min-height:100vh}
.sidebar{width:220px;background:var(--grad-sidebar);flex-shrink:0;padding:14px 0;position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column;scrollbar-width:none;}
.sidebar::-webkit-scrollbar{display:none;}
.sb-brand{padding:0 16px 14px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:8px}
.sb-app{font-family:var(--sans);font-size:13px;font-weight:700;color:#fff}
.sb-org{font-size:9px;letter-spacing:1px;color:var(--sidebar-label);margin-top:2px}
.sb-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--sidebar-label);padding:10px 16px 6px}
.sb-item{display:flex;align-items:center;gap:8px;padding:9px 12px;margin:0 12px 2px;border-radius:8px;font-family:var(--sans);font-size:13px;font-weight:500;color:var(--sidebar-text);cursor:pointer;transition:all .2s;}
.sb-item:hover{background:rgba(255,255,255,.05);}
.sb-item.active{color:var(--sidebar-text-active);font-weight:700;background:rgba(165,132,91,.15);border:1px solid rgba(165,132,91,.2);}
.sb-theme-toggle{display:flex;background:rgba(0,0,0,.3);border-radius:var(--r-md);margin:auto 16px 4px;padding:4px;gap:4px;}
.theme-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;font-size:11px;font-weight:600;color:var(--sidebar-label);border-radius:var(--r-sm);cursor:pointer;transition:all .2s;border:none;background:none;font-family:inherit;}
.theme-btn:hover{color:#fff;background:rgba(255,255,255,.05);}
.theme-btn.active{background:var(--grad-gold);color:#fff;box-shadow:var(--shadow-gold);}
.sidebar{transition:width 0.3s cubic-bezier(.22,1,.36,1);overflow-x:hidden;}
.sidebar.collapsed{width:70px;}
.sidebar.collapsed .sb-label, .sidebar.collapsed .sb-app, .sidebar.collapsed .sb-item-text {display:none;}
.sidebar.collapsed .sb-brand {padding:0 8px 16px; justify-content:center; gap:0;}
.sidebar.collapsed .sb-brand-icon {display:none;}
.sidebar.collapsed .sb-item {padding:9px; justify-content:center;}
.sidebar.collapsed .sb-item i {font-size:16px;}
.sidebar.collapsed .sb-theme-toggle{flex-direction:column;background:none;margin:auto auto 8px;padding:0;gap:6px;}
.sidebar.collapsed .theme-btn{flex:none;width:36px;height:36px;padding:0;border-radius:8px;background:rgba(var(--sidebar-ink-base),.06);}
.sidebar.collapsed .theme-btn.active{background:var(--grad-gold);color:#2a1d09;box-shadow:none;}

/* MY REQUESTS TABLE */
.req-table{width:100%;border-collapse:collapse;font-size:12.5px}
.req-table th{text-align:left;font-family:var(--sans);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--dim);padding:12px 16px;border-bottom:1px solid var(--border);background:var(--brand-gold-100)}
.req-table td{padding:11px 16px;border-bottom:1px solid var(--border);color:var(--text-primary)}
.req-table tr:last-child td{border-bottom:none}
.req-table tr:hover td{background:var(--surface-hover, #FBF8F2)}
.sbadge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:999px;font:700 10px var(--sans);letter-spacing:.3px;white-space:nowrap}
.sbadge-gold{background:var(--gold-soft);color:var(--brand-gold-600)}
.sbadge-green{background:var(--green-soft);color:var(--brand-green-700)}
.sbadge-red{background:var(--danger-soft);color:var(--danger)}
.sbadge-amber{background:var(--amber-soft);color:#92400E}
.sbadge-gray{background:var(--neutral-200);color:var(--muted)}
.type-cell{display:inline-flex;align-items:center;gap:8px;font-weight:500}
.type-cell i{color:var(--brand-gold);font-size:12px;width:14px;text-align:center}
.req-name{font-weight:600}
.req-dim{color:var(--dim)}
.row-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
@media(max-width:640px){.row-actions{justify-content:flex-start}.row-actions .btn{flex:1 1 auto}}
.empty-state{text-align:center;padding:44px 24px}
.empty-icon{width:52px;height:52px;border-radius:50%;background:var(--brand-gold-100);color:var(--brand-gold);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 14px}
.empty-title{font-family:var(--sans);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px}
.empty-sub{font-size:12px;color:var(--dim);margin-bottom:18px}
.detail-modal-box{max-width:640px;max-height:85vh;overflow-y:auto}
.filter-bar{display:flex;gap:12px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap}
.filter-bar.hidden{display:none}
.seg-group{display:inline-flex;background:var(--neutral-200);border:1px solid var(--border);border-radius:999px;padding:4px;gap:2px}
.seg-btn{display:inline-flex;align-items:center;gap:7px;border:none;background:none;font:600 12.5px var(--sans);padding:8px 16px;border-radius:999px;cursor:pointer;color:var(--text-body);white-space:nowrap;transition:all .22s cubic-bezier(.22,1,.36,1)}
.seg-btn:hover{color:var(--text-primary)}
.seg-btn.active{background:var(--grad-gold);color:#fff;box-shadow:var(--shadow-gold)}
.seg-count{font-size:10.5px;font-weight:700;line-height:1;padding:3px 7px;border-radius:999px;background:rgba(33,28,30,.08);color:inherit;font-variant-numeric:tabular-nums}
.seg-btn.active .seg-count{background:rgba(255,255,255,.3)}
.pagination{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:14px 16px}
.pagination .pagination-controls{display:flex;align-items:center;gap:4px}
.pagination .page-numbers{display:flex;align-items:center;gap:4px;margin:0 4px}
.pagination .page-ellipsis{color:var(--dim);padding:0 4px;font-size:12px}
.pagination .btn-sm{min-width:32px;height:30px;padding:0 8px;margin:0;display:inline-flex;align-items:center;justify-content:center;border-radius:999px}
.pagination .pg-arrow{font-size:16px;line-height:1;font-family:inherit}
.pagination .btn-outline:hover{background:var(--brand-gold-100);border-color:var(--gold-dark);color:var(--gold-dark)}
.pagination .page-info{font-size:12px;color:var(--dim);white-space:nowrap}
.pagination .page-info b{color:var(--text-primary);font-weight:700}
@media(max-width:520px){.pagination{justify-content:center}.pagination .page-info{width:100%;text-align:center}}
@media(max-width:640px){
  .req-table{min-width:560px}
  .req-table th, .req-table td{padding:9px 10px;font-size:11.5px}
  .pagination{gap:8px}
}

/* LOADER */
.loader-box{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px 20px;gap:16px}
.loader-ring{width:38px;height:38px;border-radius:50%;border:3px solid var(--brand-gold-100);border-top-color:var(--brand-gold);animation:loaderspin .7s linear infinite}
@keyframes loaderspin{to{transform:rotate(360deg)}}
.loader-text{font-family:var(--sans);font-size:12.5px;font-weight:600;color:var(--text-body)}
.main{flex:1;padding:0;min-width:0}
.page-hdr{background:linear-gradient(180deg,#fff 0%, var(--brand-gold-100) 100%);border-bottom:1px solid var(--border);padding:16px 24px}
.page-title{font-family:var(--sans);font-size:22px;font-weight:700;letter-spacing:-.4px;color:var(--brand-black)}
.page-sub{font-size:12.5px;color:var(--text-body);margin-top:3px}
.content{padding:20px 24px 60px;max-width:900px}
.content.content-wide{max-width:none}

/* RESPONSIVE — phones & narrow tablets */
.sidebar-tabs{display:contents}
.mobile-topbar{display:none}
.sidebar-backdrop{display:none}
@media(max-width:820px){
  .shell{flex-direction:column}
  .mobile-topbar{display:flex;align-items:center;gap:10px;background:var(--grad-sidebar);padding:10px 14px;position:sticky;top:0;z-index:250;}
  .mtb-burger{background:rgba(255,255,255,.1);border:none;color:#fff;width:32px;height:32px;border-radius:8px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .mtb-burger:hover{background:rgba(255,255,255,.18)}
  .mtb-title{color:#fff;font-family:var(--sans);font-weight:700;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sidebar{position:fixed;top:0;left:0;width:250px;max-width:82vw;height:100vh;transform:translateX(-100%);transition:transform .28s cubic-bezier(.22,1,.36,1);z-index:300;display:flex;flex-direction:column;padding:14px 0;overflow-y:auto;overflow-x:hidden;box-shadow:12px 0 32px rgba(0,0,0,.35);}
  .sidebar.mobile-open{transform:translateX(0)}
  .sidebar-backdrop{display:block;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:290;opacity:0;pointer-events:none;transition:opacity .28s;}
  .sidebar-backdrop.show{opacity:1;pointer-events:auto}
  .sb-collapse-btn{display:none !important}
  .sb-close-btn{display:flex !important;align-items:center;justify-content:flex-start}
  .content{padding:14px 14px 40px}
  .page-hdr{padding:14px 16px}
  .page-title{font-size:18px}
}

/* STEPPER */
.stepper{display:flex;align-items:center;margin-bottom:18px}
.wstep{display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0}
.wcircle{width:26px;height:26px;border-radius:50%;background:var(--neutral-200);color:var(--dim);display:flex;align-items:center;justify-content:center;font:800 11px var(--sans);transition:all .24s cubic-bezier(.22,1,.36,1)}
.wstep.done .wcircle{background:var(--brand-green);color:#fff}
.wstep.current .wcircle{background:var(--grad-gold);color:#fff;box-shadow:0 0 0 4px var(--gold-soft)}
.wlbl{font-family:var(--sans);font-size:10px;font-weight:600;color:var(--dim);white-space:nowrap}
.wstep.current .wlbl{color:var(--brand-gold-600)}
.wstep.done .wlbl{color:var(--brand-green-700)}
.wline{flex:1;height:2px;background:var(--border);margin:0 8px 18px;position:relative;overflow:hidden}

.bento{background:var(--grad-card);border:1px solid var(--border);border-radius:var(--r-lg);padding:18px;box-shadow:var(--shadow-sm);margin-bottom:16px;transition:box-shadow .24s cubic-bezier(.22,1,.36,1)}
.sub-hdr{font-family:var(--sans);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--gold-dark);margin:14px 0 10px}
.sub-hdr:first-child{margin-top:0}

.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.full{grid-column:1/-1}
@media(max-width:720px){.grid2,.grid3{grid-template-columns:1fr}}

.form-field{display:flex;flex-direction:column;margin-bottom:12px}
.field-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--dim);margin-bottom:5px}
.field-input{width:100%;background:#fff;border:1px solid var(--neutral-400);border-radius:var(--r-md);color:var(--text-primary);padding:9px 11px;font-size:12.5px;outline:none;transition:border-color .2s,box-shadow .2s}
.field-input:focus{border-color:var(--brand-gold);box-shadow:0 0 0 3px rgba(165,132,91,.12)}
.field-input:disabled{background:var(--neutral-200);color:var(--muted)}
.select-wrap{position:relative}
.select-wrap select{appearance:none;-webkit-appearance:none;padding-right:28px;cursor:pointer}
.sel-arrow{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--dim);font-size:10px;pointer-events:none}
.field-req{color:var(--danger)}
.field-err{font-size:10px;color:var(--danger);margin-top:4px;margin-bottom:8px}
.na-row{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--text-body);margin-top:5px}

.btn{font:600 12px var(--sans);border-radius:var(--r-md);border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:8px 15px;transition:all .24s cubic-bezier(.22,1,.36,1);white-space:nowrap;gap:6px}
.btn:active{transform:scale(.97)}
.btn-primary{background:var(--grad-gold);color:#fff}
.btn-primary:hover{background:linear-gradient(135deg,#8F6E46 0%,#DBA96B 100%);box-shadow:var(--shadow-gold)}
.btn-outline{background:none;color:var(--text-body);border:1px solid var(--border)}
.btn-outline:hover{color:var(--text-primary);border-color:var(--border-hover);background:#FBF8F2}
.btn-outline-danger{background:none;color:var(--danger);border:1px solid var(--danger)}
.btn-outline-danger:hover{background:var(--danger-soft);border-color:var(--danger)}
.btn-ghost{background:transparent;color:var(--muted);border:1px solid var(--border)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.back-link{display:inline-flex;align-items:center;gap:5px;background:none;border:none;padding:0;margin-bottom:8px;font:600 11px var(--sans);letter-spacing:.3px;text-transform:uppercase;color:var(--muted);cursor:pointer;transition:color .2s}
.back-link i{font-size:10px;transition:transform .2s cubic-bezier(.22,1,.36,1)}
.back-link:hover{color:var(--brand-gold-600)}
.back-link:hover i{transform:translateX(-3px)}
.back-link:disabled{opacity:.45;cursor:not-allowed}
.back-link:disabled:hover i{transform:none}
.wiz-actions{display:flex;justify-content:space-between;align-items:center;margin-top:6px;flex-wrap:wrap;gap:10px}
.wiz-actions .grp{flex-wrap:wrap}
.wiz-actions .grp{display:flex;gap:8px}

/* TYPE / PRIORITY / CATEGORY CARDS */
.card-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.pick-card{border:1.5px solid var(--border);border-radius:var(--r-lg);padding:13px;text-align:left;background:#fff;cursor:pointer;position:relative;transition:all .22s cubic-bezier(.22,1,.36,1)}
.pick-card:hover{border-color:var(--gold-light);background:var(--brand-gold-100);transform:translateY(-2px);box-shadow:0 6px 16px rgba(165,132,91,.14)}
.pick-card.selected{border-color:var(--brand-gold);background:var(--brand-gold-100);box-shadow:0 6px 16px rgba(165,132,91,.18)}
.pick-card .pc-check{position:absolute;top:10px;right:10px;width:16px;height:16px;border-radius:50%;background:var(--brand-gold);color:#fff;font-size:9px;display:none;align-items:center;justify-content:center}
.pick-card.selected .pc-check{display:flex}
.pc-icon{width:34px;height:34px;border-radius:10px;background:var(--grad-gold);color:#fff;box-shadow:0 2px 8px rgba(165,132,91,.3);display:flex;align-items:center;justify-content:center;margin-bottom:9px}
.pc-icon svg{width:16px;height:16px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.pc-title{font-family:var(--sans);font-size:12.5px;font-weight:700;color:var(--text-primary)}
.pc-desc{font-size:10px;color:var(--dim);margin-top:3px;line-height:1.4}
@media(max-width:820px){.card-grid{grid-template-columns:repeat(2,1fr)}}

/* SEARCH-SELECT (lookups: Business Unit / Specialty / Subspecialty / Country) */
.search-select{position:relative}
.search-select .field-input{padding-left:30px;padding-right:28px}
.search-select .ss-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--dim);font-size:11px;pointer-events:none}
.ss-list{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--border);border-radius:var(--r-md);box-shadow:0 8px 24px rgba(33,28,30,.12);max-height:180px;overflow-y:auto;z-index:50;display:none}
.ss-list.open{display:block}
.ss-row{padding:8px 11px;font-size:12px;color:var(--text-primary);cursor:pointer}
.ss-row:hover{background:var(--brand-gold-100)}
.ss-empty{padding:8px 11px;font-size:11px;color:var(--dim)}
.cs-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:16px;height:16px;border-radius:50%;border:none;background:var(--neutral-200);color:var(--muted);font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.cs-clear:hover{background:var(--danger-soft);color:var(--danger)}

/* CHOICE DROPDOWN (Dataverse Choice fields) */
.cselect{position:relative}
.cselect .field-input{padding-left:30px;padding-right:44px;border-left:3px solid var(--brand-gold);cursor:pointer;background:#fff}
.cselect .cs-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gold-dark);font-size:11px;pointer-events:none}
.cselect .cs-clear{right:26px}
.cselect .cs-chevron{position:absolute;right:10px;top:50%;transform:translateY(-50%);color:var(--dim);font-size:10px;pointer-events:none;transition:transform .2s}
.cselect .field-input:focus ~ .cs-chevron{transform:translateY(-50%) rotate(180deg);color:var(--brand-gold)}

.section-note{font-size:10.5px;color:var(--dim);margin-bottom:10px;line-height:1.5;background:var(--gold-soft);padding:8px 11px;border-radius:var(--r-sm)}
.collapsible-toggle{background:none;border:1px dashed var(--border-hover);border-radius:var(--r-md);padding:7px 12px;font:600 11px var(--sans);color:var(--brand-gold-600);cursor:pointer;margin:6px 0 12px}
.collapsible-body{display:none}
.collapsible-body.open{display:block}

/* PATIENT LOOKUP */
.lookup-row{display:flex;gap:8px;align-items:flex-end;margin-bottom:16px}
.lookup-row .form-field{flex:1;margin-bottom:0}
.patient-result{margin-top:12px;border:1px solid var(--border);border-radius:var(--r-md);padding:12px 14px;background:#fff;display:none}
.patient-result.show{display:block}
.pr-src{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font:700 9px var(--sans);letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px}
.pr-src.local{background:var(--green-soft);color:var(--brand-green-700)}
.pr-src.visit{background:var(--gold-soft);color:var(--brand-gold-600)}
.pr-src.new{background:var(--amber-soft);color:#92400E}

/* DROPZONE */
.dropzone{border:1.5px dashed var(--border-hover);border-radius:var(--r-lg);padding:20px 14px;text-align:center;cursor:pointer;transition:all .22s cubic-bezier(.22,1,.36,1);background:#fff}
.dropzone:hover,.dropzone.dragover{border-color:var(--brand-gold);background:var(--brand-gold-100);transform:translateY(-1px)}
.dz-icon{width:30px;height:30px;border-radius:50%;background:var(--gold-soft);color:var(--brand-gold-600);display:flex;align-items:center;justify-content:center;margin:0 auto 8px}
.dz-icon svg{width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.dz-title{font-family:var(--sans);font-size:12px;font-weight:600;color:var(--text-primary)}
.dz-sub{font-size:10px;color:var(--dim);margin-top:3px}
.dz-file{font-family:var(--mono);font-size:11px;color:var(--brand-gold-600);margin-top:6px}
.attach-row{display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:6px;background:#fff}

/* REVIEW STEP */
.ro-card{border:1px solid var(--border);border-radius:var(--r-lg);padding:14px 16px;background:#fff;margin-bottom:12px}
.ro-title{font-family:var(--sans);font-size:12px;font-weight:700;color:var(--brand-gold-600);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;display:flex;align-items:center;gap:7px}
.kv-grid{margin-bottom:14px}
.kv-item{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--border);font-size:12px}
.kv-item:last-child{border-bottom:none}
.kv-item .k{color:var(--dim);font-size:11px;text-transform:none;letter-spacing:normal;margin-bottom:0}
.kv-item .v{color:var(--text-primary);font-weight:600;text-align:right;font-size:12px}
.action-card{border:1px solid var(--border);border-radius:var(--r-lg);padding:14px 16px;background:#fff;margin-bottom:12px}
.action-card .ro-title{color:var(--brand-gold-600)}
.detail-page-badges{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.code-chip{display:inline-block;font-family:var(--mono);font-size:11px;font-weight:600;color:var(--dim);background:var(--neutral-200);padding:2px 8px;border-radius:999px;vertical-align:middle;margin-left:4px}

.hidden{display:none !important}

/* MODALS */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:500}
.modal-box{background:#fff;border-radius:var(--r-xl);width:92%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:modalIn .25s cubic-bezier(.22,1,.36,1)}
@keyframes modalIn{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}
.modal-hdr{padding:18px 20px 4px}
.modal-title{font-family:var(--sans);font-size:16px;font-weight:800;color:var(--brand-black)}
.modal-sub{font-size:11.5px;color:var(--text-body);margin-top:4px}
.modal-body{padding:16px 20px 20px}
.type-opt{display:flex;align-items:flex-start;gap:10px;border:1.5px solid var(--border);border-radius:var(--r-lg);padding:12px 14px;cursor:pointer;margin-bottom:8px;transition:all .2s}
.type-opt:hover{border-color:var(--gold-light);background:var(--brand-gold-100)}
.type-opt.selected{border-color:var(--brand-gold);background:var(--brand-gold-100)}
.type-radio{width:16px;height:16px;border-radius:50%;border:2px solid var(--border-hover);flex-shrink:0;margin-top:2px;position:relative}
.type-opt.selected .type-radio{border-color:var(--brand-gold)}
.type-opt.selected .type-radio::after{content:'';position:absolute;inset:2px;border-radius:50%;background:var(--brand-gold)}
.type-name{font-family:var(--sans);font-size:13px;font-weight:700;color:var(--text-primary)}
.type-hint{font-size:10.5px;color:var(--dim);margin-top:2px}

/* REQUEST TYPE MODAL */
.type-modal-box{max-width:560px}
.type-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.type-grid-inline{margin-bottom:20px}
@media(min-width:760px){.type-grid-inline{grid-template-columns:repeat(4,1fr)}}
.type-tile{border:1.5px solid var(--border);border-radius:var(--r-lg);padding:16px 14px;cursor:pointer;text-align:left;background:#fff;position:relative;transition:all .22s cubic-bezier(.22,1,.36,1)}
.type-tile:hover{border-color:var(--gold-light);background:var(--brand-gold-100);transform:translateY(-3px);box-shadow:0 10px 24px rgba(165,132,91,.16)}
.type-tile.selected{border-color:var(--brand-gold);background:var(--brand-gold-100);box-shadow:0 10px 24px rgba(165,132,91,.22)}
.type-tile .tt-check{position:absolute;top:10px;right:10px;width:18px;height:18px;border-radius:50%;background:var(--brand-gold);color:#fff;font-size:10px;display:none;align-items:center;justify-content:center}
.type-tile.selected .tt-check{display:flex}
.tt-icon{width:38px;height:38px;border-radius:11px;background:var(--grad-gold);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;margin-bottom:10px;box-shadow:0 3px 10px rgba(165,132,91,.3)}
.tt-title{font-family:var(--sans);font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px}
.tt-hint{font-size:10.5px;color:var(--dim);line-height:1.5}
.type-pill-row{margin-bottom:16px}
.type-pill{display:inline-flex;align-items:center;gap:9px;background:var(--brand-gold-100);border:1px solid var(--gold-light);border-radius:999px;padding:8px 8px 8px 14px;font-family:var(--sans);font-size:12.5px;font-weight:700;color:var(--brand-gold-600)}
.type-pill i{color:var(--brand-gold)}
.type-pill button{background:#fff;border:1px solid var(--border);color:var(--text-body);font:600 10.5px var(--sans);padding:4px 11px;border-radius:999px;cursor:pointer}
.type-pill button:hover{background:var(--brand-gold-100);border-color:var(--gold-light)}
.btn-block{width:100%}
.modal-btn-row{display:flex;gap:8px}
.modal-btn-row .btn-primary{flex:1}

.toast-rack{position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:7px;z-index:600}
.toast{background:#fff;border:1px solid var(--border);border-left:4px solid var(--brand-gold);border-radius:var(--r-md);padding:11px 14px;box-shadow:0 4px 16px rgba(0,0,0,.10);display:flex;align-items:flex-start;gap:9px;min-width:270px;max-width:380px;animation:toastIn .3s cubic-bezier(.22,1,.36,1)}
@keyframes toastIn{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}
.toast-success{border-left-color:var(--brand-green)}
.toast-alert{border-left-color:var(--danger)}
.toast svg{width:16px;height:16px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;display:block}

/* RESPONSIVE — final overrides, kept at the end on purpose (source-order wins on equal specificity) */
@media(max-width:1600px){
  .content.content-wide{max-width:1400px;margin:0 auto}
}
@media(max-width:520px){
  .nav-title{display:none}
  .nav-dot{display:none}
  #region-badge{display:none}
  .filter-bar{gap:8px}
  .filter-bar .form-field{min-width:0 !important;flex:1 1 45%}
  .modal-box{padding-bottom:4px}
  .type-modal-box .modal-body{padding:12px 14px 16px}
  .lookup-row{flex-direction:column;align-items:stretch}
  .lookup-row .btn{width:100%}
  .toast-rack{left:12px;right:12px;bottom:12px}
  .toast{min-width:0;max-width:none;width:100%}
  .modal-btn-row{flex-direction:column}
  .wiz-actions{justify-content:center}
  .wiz-actions>.btn, .wiz-actions .grp{width:100%}
  .wiz-actions .grp{justify-content:center}
  .card-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:460px){
  .type-grid{grid-template-columns:1fr}
  .wlbl{font-size:9px;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .modal-box{width:94%}
  .detail-modal-box{max-height:88vh}
  .pagination .btn-sm{min-width:28px;height:28px;padding:0 6px}
}
@media(max-width:380px){
  .wlbl{display:none}
  .wline{margin:0 6px 0}
  .btn{padding:8px 12px;font-size:11.5px}
  .card-grid{grid-template-columns:repeat(2,1fr);gap:8px}
  .pick-card{padding:10px}
  .toast-rack{left:8px;right:8px;bottom:8px}
}

/* App-level top bar — always on */
.nav-burger{display:none;background:rgba(255,255,255,.1);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:13px;cursor:pointer;align-items:center;justify-content:center;flex-shrink:0}
.nav-burger:hover{background:rgba(255,255,255,.18)}
.navbar{display:flex !important}
.mobile-topbar{display:none !important}
.sidebar{top:48px;height:calc(100vh - 48px)}
@media(max-width:820px){
  .nav-burger{display:flex}
  .sidebar{top:48px;height:calc(100vh - 48px)}
}
````

### `src/styles/app.css`

````css
/* ServiceHub additions on top of tokens.css + base.css (both kept verbatim).
   Scoped to .servhub-app like base.css — never global selectors. */

/* Rich-text (CKEditor) values: base.css zeroes margin/padding on every element inside the app,
   which pushes list bullets outside their card. Restore list indentation and paragraph spacing,
   as the legacy page's .ck-content rules did. */
/* Padding on both sides: Arabic (RTL) items inside an LTR list put their marker on the right. */
.servhub-app .rich-text ul,
.servhub-app .rich-text ol { padding-inline: 1.4em; margin: 4px 0; }
.servhub-app .rich-text.ProseMirror:focus { outline: none; border-color: var(--brand-gold); box-shadow: 0 0 0 3px rgba(165,132,91,.12); }
.servhub-app .rich-text li { margin-bottom: 2px; }
.servhub-app .rich-text p { margin: 0 0 6px; }
.servhub-app .rich-text p:last-child { margin-bottom: 0; }
.servhub-app .rich-text img { max-width: 100%; height: auto; }
.servhub-app .rich-text a { color: var(--gold-dark); text-decoration: underline; }

/* ---- Andalusia Service Hub sections (legacy web resource screens) ---- */
.servhub-app .hub-filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; align-items: end; }
.servhub-app .hub-filter { display: flex; flex-direction: column; position: relative; min-width: 0; }
.servhub-app .hub-search { grid-column: span 2; }
.servhub-app .hub-search-wrap { position: relative; display: block; }
.servhub-app .hub-search-wrap svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
.servhub-app .hub-search-wrap .field-input { padding-left: 30px; }
.servhub-app .hub-refresh { justify-self: start; align-self: end; }
.servhub-app .hub-results-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border); }
.servhub-app .hub-count { font-size: 12px; font-weight: 700; color: var(--gold-dark); }
.servhub-app .hub-multi-btn { display: flex; justify-content: space-between; align-items: center; text-align: left; cursor: pointer; }
.servhub-app .hub-multi-arrow { font-size: 9px; color: var(--dim); }
.servhub-app .hub-multi-menu { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 4px; max-height: 260px; overflow-y: auto; background: var(--surface-1, #fff); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 4px; }
.servhub-app .hub-multi-opt { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: var(--r-sm); font-size: 12.5px; cursor: pointer; color: var(--text-primary); }
.servhub-app .hub-multi-opt:hover { background: var(--gold-soft); }
.servhub-app .hub-multi-opt.group { font-weight: 700; }
.servhub-app .hub-multi-opt.child { padding-left: 26px; }
.servhub-app .hub-multi-opt input { accent-color: var(--brand-gold); }

.servhub-app .hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; margin-bottom: 16px; }
.servhub-app .hub-card { position: relative; display: flex; flex-direction: column; margin-bottom: 0; transition: box-shadow .2s, border-color .2s; }
.servhub-app .hub-card:hover { border-color: var(--gold-light); box-shadow: 0 6px 16px rgba(165,132,91,.14); }
.servhub-app .hub-card-hdr { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; padding-right: 26px; }
.servhub-app .hub-avatar { flex: none; width: 42px; height: 42px; border-radius: 12px; background: var(--grad-gold); color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-gold); }
.servhub-app .hub-avatar-lg { width: 60px; height: 60px; border-radius: 16px; }
.servhub-app .hub-card-names { min-width: 0; }
.servhub-app .hub-card-title { font-family: var(--sans); font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.3; }
.servhub-app .hub-card-sub { font-size: 12px; color: var(--dim); margin-top: 2px; text-align: left; }
.servhub-app .hub-card .kv-grid { margin-bottom: 8px; }
.servhub-app .hub-fees { margin-bottom: 12px; }
.servhub-app .hub-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.servhub-app .hub-badges .sbadge { white-space: normal; }
.servhub-app .hub-card-action { margin-top: auto; }
.servhub-app .hub-more { display: flex; justify-content: center; margin-bottom: 16px; }
.servhub-app .hub-muted { font-size: 12px; color: var(--dim); }

.servhub-app .hub-flag { position: absolute; top: 12px; right: 12px; font-size: 13px; cursor: help; display: flex; align-items: center; gap: 4px; z-index: 2; outline: none; }
.servhub-app .hub-flag-date { font-size: 10px; font-weight: 700; color: var(--danger); }
.servhub-app .hub-flag-tip { display: none; position: absolute; top: 100%; right: 0; margin-top: 6px; width: 260px; background: var(--surface-1, #fff); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 8px 10px; font-size: 11.5px; color: var(--text-primary); cursor: default; }
.servhub-app .hub-flag:hover .hub-flag-tip, .servhub-app .hub-flag:focus .hub-flag-tip { display: block; }
.servhub-app .hub-flag-item + .hub-flag-item { border-top: 1px dashed var(--border); margin-top: 6px; padding-top: 6px; }
.servhub-app .hub-flag-title { font-weight: 700; color: var(--danger); }
.servhub-app .hub-flag-dates { color: var(--dim); font-size: 10.5px; margin-top: 2px; }

.servhub-app .hub-profile-hdr { display: flex; gap: 16px; align-items: center; }
.servhub-app .hub-profile-title { font-family: var(--sans); font-size: 18px; font-weight: 700; color: var(--text-primary); }
.servhub-app .hub-fee-block { margin-bottom: 12px; }
.servhub-app .hub-two-lang { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.servhub-app .hub-text { font-size: 12.5px; line-height: 1.6; color: var(--text-body); }
.servhub-app .hub-pre { white-space: pre-wrap; }
@media (max-width: 720px) {
  .servhub-app .hub-search { grid-column: auto; }
  .servhub-app .hub-two-lang { grid-template-columns: 1fr; }
}
.servhub-app .hub-exception { font-size: 12px; line-height: 1.5; color: var(--text-primary); background: var(--danger-soft); border-left: 3px solid var(--danger); padding: 8px 11px; border-radius: var(--r-sm); margin-bottom: 8px; }
.servhub-app .hub-exception:last-child { margin-bottom: 0; }
.servhub-app .hub-exception strong { color: var(--danger); }
.servhub-app .hub-card-body { margin-top: 10px; }
.servhub-app .hub-ar { text-align: right; }
.servhub-app .hub-count-note { margin: -6px 0 12px; }
.servhub-app .hub-filter .seg-group { align-self: flex-start; }
.servhub-app .hub-grid-sm { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.servhub-app .hub-card-btn { text-align: left; cursor: pointer; font: inherit; gap: 4px; }
.servhub-app .hub-card-btn:focus-visible, .servhub-app .hub-tile:focus-visible { outline: 2px solid var(--brand-gold); outline-offset: 2px; }
.servhub-app .hub-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
.servhub-app .hub-tile { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; text-align: center; font: inherit; }
.servhub-app .hub-fold { padding: 0; }
.servhub-app .hub-fold > summary { cursor: pointer; padding: 12px 16px; margin: 0; list-style: none; }
.servhub-app .hub-fold > summary::-webkit-details-marker { display: none; }
.servhub-app .hub-fold > summary::after { content: '▼'; margin-left: auto; font-size: 10px; color: var(--dim); transition: transform .2s; }
.servhub-app .hub-fold[open] > summary::after { transform: rotate(180deg); }
.servhub-app .hub-fold > :not(summary) { padding: 0 16px; }
.servhub-app .hub-fold[open] { padding-bottom: 12px; }
.servhub-app .hub-note { border-top: 1px dashed var(--border); padding-top: 8px; margin-top: 8px; font-size: 12.5px; }
.servhub-app .hub-note strong { display: block; margin-bottom: 4px; color: var(--text-primary); }
.servhub-app .hub-fold-card > summary { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; }
.servhub-app .hub-fold-card > summary .hub-card-names { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.servhub-app .hub-fold-card > summary::after { margin-top: 4px; }
.servhub-app .hub-subblock { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); }
.servhub-app .hub-photo { width: 100%; height: 170px; object-fit: cover; border-radius: var(--r-md); margin-bottom: 12px; background: var(--neutral-200); }
.servhub-app a.hub-card-action { display: inline-flex; justify-content: center; align-items: center; gap: 6px; text-decoration: none; }
.servhub-app .hub-copy { display: inline-flex; align-items: center; gap: 6px; }
.servhub-app .hub-mono { font-family: var(--mono); font-size: 12px; letter-spacing: .3px; }
.servhub-app .hub-account { margin-top: 14px; max-width: 640px; }
.servhub-app .hub-card-tags { display: flex; gap: 6px; margin-bottom: 8px; }
.servhub-app .hub-card-meta { font-size: 11.5px; color: var(--gold-dark); font-weight: 600; margin-top: 4px; }
.servhub-app .hub-card-warn { border-color: var(--amber-ink, #E6A844); box-shadow: 0 0 0 1px rgba(230,168,68,.35); }
.servhub-app .hub-price { color: var(--brand-green); }
.servhub-app .hub-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.servhub-app .hub-list .ro-card { margin-bottom: 0; }
.servhub-app .hub-prices { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
.servhub-app .hub-price-before { font-size: 11px; color: var(--dim); text-decoration: line-through; }
.servhub-app .hub-prices .hub-price { font-weight: 700; font-size: 13px; }
.servhub-app .hub-gap { margin-top: 14px; }
.servhub-app .hub-viewer-hdr { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.servhub-app .hub-link-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.servhub-app .hub-link-btn { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1.5px solid var(--border); border-radius: var(--r-lg); background: var(--surface-1, #fff); color: var(--text-primary); font: 600 12.5px var(--sans); text-align: left; text-decoration: none; cursor: pointer; transition: all .2s; }
.servhub-app .hub-link-btn:hover { border-color: var(--gold-light); background: var(--brand-gold-100); transform: translateY(-1px); }
.servhub-app .hub-link-btn.active { border-color: var(--brand-gold); background: var(--brand-gold-100); }
.servhub-app .hub-link-btn:focus-visible { outline: 2px solid var(--brand-gold); outline-offset: 2px; }
.servhub-app .hub-link-btn:disabled { cursor: not-allowed; opacity: .6; transform: none; border-style: dashed; background: var(--surface-1, #fff); }
.servhub-app .hub-link-missing { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--muted); }
.servhub-app .hub-card-btn:disabled { opacity: .55; cursor: not-allowed; }
.servhub-app .hub-self-start { align-self: flex-start; margin-bottom: 4px; }
.servhub-app .hub-table-wrap { overflow-x: auto; }
.servhub-app .hub-table { width: 100%; }
.servhub-app .hub-table td { vertical-align: top; font-size: 12.5px; }
.servhub-app .hub-table td .rich-text { min-width: 180px; }
/* Fold arrow: explicit glyph per state (a transform on the inline ::after was not applied). */
.servhub-app .hub-fold > summary::after { display: inline-block; transform: none; }
.servhub-app .hub-fold[open] > summary::after { content: '▲'; transform: none; }

/* Doctors per row (user choice) — narrow screens fall back to as many cards as fit. */
.servhub-app .hub-toolbar { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-bottom: 10px; }
.servhub-app .hub-toolbar .field-lbl { margin-bottom: 0; }
@media (max-width: 900px) {
  .servhub-app .hub-grid-cols { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important; }
}

/* Text size toggle in the navbar (A / A / A, growing). */
.servhub-app .text-size-toggle { display: inline-flex; align-items: center; gap: 2px; padding: 2px; border-radius: 999px; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); }
.servhub-app .text-size-btn { background: none; border: none; color: rgba(255,255,255,.75); font-family: var(--sans); font-weight: 700; line-height: 1; padding: 4px 8px; border-radius: 999px; cursor: pointer; }
.servhub-app .text-size-btn.size-0 { font-size: 11px; }
.servhub-app .text-size-btn.size-1 { font-size: 13.5px; }
.servhub-app .text-size-btn.size-2 { font-size: 16px; }
.servhub-app .text-size-btn:hover { color: #fff; }
.servhub-app .text-size-btn.active { background: var(--grad-gold); color: #fff; }
.servhub-app .text-size-btn:focus-visible { outline: 2px solid var(--gold-light); outline-offset: 1px; }

/* Doctor cards — legacy layout: round photo on top, centred names; width capped so wide screens
   don't stretch them. */
.servhub-app .hub-doctor-area { margin: 0 auto; }
.servhub-app .hub-doctor-hdr { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; padding: 4px 8px 12px; margin-bottom: 8px; border-bottom: 1px solid var(--border); }
.servhub-app .hub-doctor-hdr .hub-card-sub { text-align: center; }
.servhub-app .hub-doctor-hdr .hub-card-title { font-size: 15px; }
.servhub-app .hub-doctor-photo { width: 90px; height: 90px; border-radius: 50%; border: 3px solid var(--gold-soft); object-fit: cover; margin-bottom: 10px; background: var(--brand-gold-100); }
.servhub-app .hub-doctor-photo.large { width: 110px; height: 110px; margin-bottom: 0; }
.servhub-app div.hub-doctor-photo { border-radius: 50%; }
/* Consultation fees: one per line, larger. */
.servhub-app .hub-fee-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.servhub-app .hub-fee-list li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--r-md); background: var(--gold-soft); font-family: var(--sans); font-size: 14px; }
.servhub-app .hub-fee-list li.first { background: var(--brand-gold-100); box-shadow: inset 0 0 0 1.5px var(--gold-light); }
.servhub-app .hub-fee-bu { font-weight: 700; color: var(--text-primary); }
.servhub-app .hub-fee-amount { font-weight: 800; color: var(--brand-green); white-space: nowrap; }

/* Readability for call-center use: labels and secondary names were too faint (--dim). */
.servhub-app .hub-page .kv-item .k { color: var(--text-body); font-weight: 500; font-size: 12px; }
.servhub-app .hub-page .hub-card-sub { color: var(--text-body); }
.servhub-app .hub-page .field-lbl { color: var(--muted); }
.servhub-app .hub-page .hub-muted { color: var(--muted); }
/* Doctor photo: keep the face (top of the image) in the circle. */
.servhub-app img.hub-doctor-photo { object-position: 50% 8%; }

/* Filter cells never push the page wider than the screen (the price-sort buttons overflowed). */
.servhub-app .hub-filters > * { min-width: 0; }
.servhub-app .hub-filter-wide { grid-column: span 2; }
.servhub-app .hub-filter .seg-group { flex-wrap: wrap; max-width: 100%; }
@media (max-width: 720px) { .servhub-app .hub-filter-wide { grid-column: auto; } }
/* Safety net: a wide child inside the content area scrolls itself instead of the whole page. */
.servhub-app .main { min-width: 0; overflow-x: clip; }

/* The page scrollbar belongs to the app's own document (the code app runs in its own frame), so it is
   styled here too. Only scrollbar colours — no layout resets on html/body (they break the player). */
html:has(.servhub-app) { scrollbar-width: thin; scrollbar-color: rgba(18, 110, 92, .45) #eef1f4; background: #eef1f4; }
html:has(.servhub-app.dark) { scrollbar-color: rgba(64, 255, 184, .35) #1c1d22; background: #1c1d22; }
/* base.css offsets the default 8px page margin on the left/top only; do the same on the right and
   bottom so no white strip shows next to the scrollbar (body itself is never restyled). */
.servhub-app { margin-right: -8px; margin-bottom: -8px; }

/* Plain-text "points" lists are the .rich-text element itself (not nested), so indent them too. */
.servhub-app ul.rich-text, .servhub-app ol.rich-text { padding-inline: 1.4em; margin: 0; }
````

### `src/styles/synapse.css`

````css
/*
  Synapse / HMIS Design System layer (user decision 2026-09-29: apply Synapse to the whole app).

  Loaded AFTER tokens.css + base.css + app.css. It:
    1. defines the Synapse --ds-* tokens (values from hmis-design-system v3 tokens.css),
    2. re-points the legacy variables used by base.css/app.css at those tokens, so every existing
       component re-skins without renaming classes,
    3. applies the Synapse sizing contract (Urbanist, 14px body/tables/labels, 40px table rows,
       44px fields, 32/40px buttons, 8px control radius, 16px card radius, teal focus ring).
  Lanes: system/deterministic = teal. Analytics gold / AI purple are defined for future use only.
*/

/* ================= 1. Tokens ================= */
.servhub-app {
  /* System lane (teal) */
  --ds-color-primary: #126e5c;
  --ds-color-primary-deep: #023635;
  --ds-color-primary-soft: #d9f8ec;
  --ds-color-primary-mint: #40ffb8;
  --ds-color-primary-line: rgba(18, 110, 92, .14);
  --ds-color-primary-50: #f0faf7;
  --ds-color-primary-100: #d9f3ea;
  --ds-color-primary-200: #b7e7d7;
  --ds-color-primary-300: #82d2ba;
  --ds-color-primary-400: #4bb69a;
  --ds-color-primary-500: #278f76;
  --ds-color-primary-600: #126e5c;
  --ds-color-primary-700: #0d594b;
  --ds-color-primary-800: #0a463c;
  --ds-color-primary-900: #073a33;

  /* Neutrals */
  --ds-color-neutral-50: #f8fafc;
  --ds-color-neutral-100: #f1f5f9;
  --ds-color-neutral-200: #e2e8f0;
  --ds-color-neutral-300: #cbd5e1;
  --ds-color-neutral-400: #94a3b8;
  --ds-color-neutral-500: #64748b;
  --ds-color-neutral-600: #475569;
  --ds-color-neutral-700: #334155;

  /* Analytics (gold) and AI (purple) lanes — reserved, not used for normal features */
  --ds-color-analytics: #c99b3b;
  --ds-color-analytics-deep: #a07118;
  --ds-color-analytics-soft: #fbefd6;
  --ds-color-ai: #8d73de;
  --ds-color-ai-deep: #6046aa;
  --ds-color-ai-soft: #eee9fb;

  /* Status tones */
  --ds-status-success-text: #176148;
  --ds-status-success-bg: rgba(64, 255, 184, .2);
  --ds-status-high-text: #8f5c0d;
  --ds-status-high-bg: rgba(255, 225, 160, .55);
  --ds-status-urgent-text: #a23e3e;
  --ds-status-urgent-bg: rgba(255, 196, 196, .55);
  --ds-status-draft-text: #67736f;
  --ds-status-draft-bg: rgba(211, 218, 216, .75);
  --ds-status-info-text: #185c67;
  --ds-status-info-bg: rgba(185, 230, 235, .4);
  --ds-color-danger: #dc2626;
  --ds-color-danger-soft: #fef2f2;

  /* Surfaces & text */
  --ds-color-surface-raised: #ffffff;
  --ds-color-surface-muted: #f5f7f6;
  --ds-color-surface-recessed: #f1f5f9;
  --ds-color-surface-hover: #f1f5f9;
  --ds-color-surface-selected: #eff8f4;
  --ds-color-surface-overlay: rgba(3, 17, 15, .58);
  --ds-color-text-primary: #263037;
  --ds-color-text-secondary: #4d5860;
  --ds-color-text-muted: #737981;
  --ds-color-border: rgba(79, 81, 96, .14);
  --ds-color-border-strong: rgba(26, 74, 66, .2);

  /* Type */
  --ds-font-family: 'Urbanist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;

  /* Radius, shadow, motion */
  --ds-radius-control: 8px;
  --ds-radius-tag: 4px;
  --ds-radius-card: 16px;
  --ds-shadow-sm: 0 13px 28px rgba(82, 82, 100, .11), inset 0 1px 0 rgba(255, 255, 255, .88);
  --ds-shadow-lg: 0 30px 70px rgba(76, 73, 105, .19), inset 0 1px 0 rgba(255, 255, 255, .9);
  --ds-shadow-button: 0 10px 22px rgba(2, 54, 53, .17), inset 0 1px 0 rgba(255, 255, 255, .13);
  --ds-shadow-button-hover: 0 13px 28px rgba(2, 54, 53, .23);
  --ds-shadow-dialog: 0 20px 25px -5px rgba(0, 0, 0, .1), 0 8px 10px -6px rgba(0, 0, 0, .1);
  --ds-focus-ring: 0 0 0 3px rgba(18, 110, 92, .18);
  --ds-ease-settle: cubic-bezier(.16, 1, .3, 1);
  --ds-duration-fast: 180ms;

  /* Shell */
  --ds-shell-nav: radial-gradient(420px 260px at 0% 0%, rgba(64, 255, 184, .14), transparent 70%), linear-gradient(180deg, #064642 0%, #023635 100%);
  --ds-shell-bg:
    radial-gradient(980px 760px at -4% 30%, rgba(205, 224, 230, .7) 0%, transparent 68%),
    radial-gradient(980px 780px at 102% 12%, rgba(55, 111, 82, .14) 0%, transparent 70%),
    radial-gradient(760px 520px at 70% 105%, rgba(141, 115, 222, .07) 0%, transparent 70%),
    radial-gradient(640px 440px at 30% 100%, rgba(201, 155, 59, .06) 0%, transparent 70%),
    #eef1f4;

  /* ---- 2. Legacy variables (base.css / app.css) re-pointed at Synapse ---- */
  --brand-gold: var(--ds-color-primary);
  --gold-dark: var(--ds-color-primary);
  --gold-light: var(--ds-color-primary-300);
  --brand-gold-600: var(--ds-color-primary-deep);
  --brand-gold-100: var(--ds-color-surface-selected);
  --gold-soft: rgba(18, 110, 92, .08);
  --grad-gold: linear-gradient(180deg, #16806b 0%, #126e5c 100%);
  --shadow-gold: var(--ds-shadow-button);
  --brand-green: var(--ds-color-primary-700);
  --green-dark: var(--ds-color-primary-700);
  --brand-green-700: var(--ds-status-success-text);
  --brand-green-200: var(--ds-color-primary-200);
  --brand-green-100: var(--ds-color-surface-muted);
  --green-soft: var(--ds-status-success-bg);
  --grad-green: linear-gradient(180deg, #16806b 0%, #126e5c 100%);
  --ink: var(--ds-color-text-primary);
  --brand-black: var(--ds-color-text-primary);
  --text-primary: var(--ds-color-text-primary);
  --text-body: var(--ds-color-text-secondary);
  --muted: var(--ds-color-text-muted);
  --dim: #7c858d;
  --canvas: #eef1f4;
  --border: var(--ds-color-border);
  --border-hover: var(--ds-color-border-strong);
  --neutral-400: var(--ds-color-neutral-300);
  --neutral-200: var(--ds-color-neutral-100);
  --danger: var(--ds-color-danger);
  --danger-soft: var(--ds-color-danger-soft);
  --amber-soft: var(--ds-status-high-bg);
  --amber-ink: var(--ds-status-high-text);
  --grad-nav: var(--ds-shell-nav);
  --grad-sidebar: var(--ds-shell-nav);
  --grad-card: linear-gradient(180deg, #ffffff 0%, #ffffff 100%);
  --sidebar-text: rgba(255, 255, 255, .8);
  --sidebar-text-active: #ffffff;
  --sidebar-label: rgba(216, 248, 235, .55);
  --sidebar-active-bg: rgba(64, 255, 184, .14);
  --surface-hover: var(--ds-color-surface-hover);
  --sans: var(--ds-font-family);
  --body: var(--ds-font-family);
  --r-sm: 8px;
  --r-md: 8px;
  --r-lg: 16px;
  --r-xl: 16px;
  --shadow-sm: var(--ds-shadow-sm);
}

/* ---- Dark mode (the app toggles `.dark` on .servhub-app) ---- */
.servhub-app.dark {
  --ds-color-primary: #1f9a80;
  --ds-color-primary-deep: #78d9bd;
  --ds-color-primary-300: #4bb69a;
  --ds-color-surface-raised: #23242a;
  --ds-color-surface-muted: #202126;
  --ds-color-surface-hover: #2c3532;
  --ds-color-surface-selected: #173a32;
  --ds-color-text-primary: #f1f5f3;
  --ds-color-text-secondary: #c3cdca;
  --ds-color-text-muted: #b3bfbb;
  --ds-color-border: rgba(255, 255, 255, .08);
  --ds-color-border-strong: rgba(64, 255, 184, .16);
  --ds-status-success-text: #7ce8c1;
  --ds-status-success-bg: rgba(64, 255, 184, .12);
  --ds-status-high-text: #f3c56b;
  --ds-status-high-bg: rgba(243, 197, 107, .14);
  --ds-color-danger: #f28b8b;
  --ds-color-danger-soft: rgba(242, 139, 139, .12);
  --ds-shadow-sm: 0 16px 34px rgba(0, 0, 0, .35);
  --ds-shadow-button: 0 10px 22px rgba(0, 0, 0, .35);
  --ds-focus-ring: 0 0 0 3px rgba(64, 255, 184, .22);
  --ds-shell-bg:
    radial-gradient(900px 700px at -4% 30%, rgba(18, 110, 92, .16) 0%, transparent 68%),
    radial-gradient(900px 700px at 102% 12%, rgba(141, 115, 222, .08) 0%, transparent 70%),
    #1c1d22;

  --canvas: #1c1d22;
  --surface-1: var(--ds-color-surface-raised);
  --surface-2: var(--ds-color-surface-muted);
  --neutral-200: #2a2b31;
  --neutral-400: #3a3c44;
  --dim: #9aa6a2;
  --gold-dark: var(--ds-color-primary-deep);
  --brand-gold-600: var(--ds-color-primary-deep);
  --brand-gold-100: var(--ds-color-surface-selected);
  --gold-soft: rgba(64, 255, 184, .08);
  --brand-green: #7ce8c1;
  --brand-green-100: var(--ds-color-surface-muted);
  --grad-card: linear-gradient(180deg, #23242a 0%, #23242a 100%);
  --brand-black: var(--ds-color-text-primary);
  /* tokens.css `.servhub-app.dark` sets these with higher specificity than the light mapping above,
     so every one it touches is restated here. */
  --text-primary: var(--ds-color-text-primary);
  --text-body: var(--ds-color-text-secondary);
  --muted: var(--ds-color-text-muted);
  --border: var(--ds-color-border);
  --border-hover: var(--ds-color-border-strong);
  --gold-light: var(--ds-color-primary-300);
  --brand-green-200: rgba(64, 255, 184, .2);
  --brand-green-700: var(--ds-status-success-text);
  --green-soft: var(--ds-status-success-bg);
  --amber-soft: var(--ds-status-high-bg);
  --amber-ink: var(--ds-status-high-text);
  --danger: var(--ds-color-danger);
  --danger-soft: var(--ds-color-danger-soft);
  --shadow-sm: var(--ds-shadow-sm);
  --shadow-gold: var(--ds-shadow-button);
}

/* ================= 3. Shell ================= */
.servhub-app { background: var(--ds-shell-bg); background-attachment: fixed; font-size: 14px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
.servhub-app .navbar { background: var(--ds-shell-nav); height: 52px; }
.servhub-app .sidebar { top: 52px; height: calc(100vh - 52px); width: 236px; }
/* The shell sits under the 52px top bar, so it fills the rest of the window, not a full extra 100vh. */
.servhub-app .shell { min-height: calc(100vh - 52px); }
.servhub-app .sb-label { font-size: 12px; letter-spacing: 1.2px; }
.servhub-app .sb-item { font-size: 14px; padding: 9px 12px; }
.servhub-app .sb-item:hover { background: rgba(255, 255, 255, .06); }
.servhub-app .sb-item.active { background: var(--sidebar-active-bg); border: 1px solid rgba(64, 255, 184, .22); color: #fff; font-weight: 600; }
.servhub-app .sb-item.active svg { color: var(--ds-color-primary-mint); }
.servhub-app .sb-app { font-size: 15px; }
.servhub-app .sb-org { font-size: 11px; }
.servhub-app .theme-btn { font-size: 13px; }
.servhub-app .nav-title { font-size: 15px; }
.servhub-app .nav-user { font-size: 13px; }
.servhub-app .nav-brand { background: linear-gradient(135deg, #40ffb8 0%, #126e5c 100%); color: #023635; }
.servhub-app .nav-dot { background: var(--ds-color-primary-mint); }
.servhub-app .region-chip { font-size: 13px; }

/* Page header (PageHeader.tsx) = "Band" (user choice 2026-10-04): the deep-teal gradient of the Band
   cards as a rounded strip, white title, the page's icon in a translucent tile. */
.servhub-app .page-hdr, .servhub-app.dark .page-hdr { display: flex; align-items: center; gap: 14px; margin: 16px 24px 0; padding: 20px 24px; border: none; border-radius: var(--ds-radius-card);
  background: radial-gradient(420px 160px at 0% 0%, rgba(64, 255, 184, .16), transparent 70%), linear-gradient(90deg, #063b36, #0d594b); box-shadow: var(--ds-shadow-sm); }
.servhub-app .ph-text { min-width: 0; }
.servhub-app .page-title { font-size: clamp(19px, 1.65vw, 24px); font-weight: 700; letter-spacing: 0; line-height: 1.2; color: #fff; }
.servhub-app .page-sub { font-size: 14px; color: var(--muted); }
.servhub-app .page-hdr .page-sub { color: rgba(255, 255, 255, .75); }
.servhub-app .ph-icon { width: 46px; height: 46px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 13px;
  color: var(--ds-color-primary-mint); background: rgba(255, 255, 255, .12); border: 1px solid rgba(255, 255, 255, .18); }
.servhub-app .page-hdr .table-pill { background: rgba(255, 255, 255, .16); color: #fff; }
@media (max-width: 640px) {
  .servhub-app .page-hdr, .servhub-app.dark .page-hdr { margin: 12px 12px 0; padding: 14px 16px; }
  .servhub-app .ph-icon { width: 38px; height: 38px; }
}

/* ================= Surfaces ================= */
.servhub-app .bento { background: var(--ds-color-surface-raised); border-radius: var(--ds-radius-card); box-shadow: var(--ds-shadow-sm); border-color: var(--border); padding: 20px; }
.servhub-app .ro-card,
.servhub-app .action-card { border-radius: var(--ds-radius-card); background: var(--ds-color-surface-raised); }
.servhub-app .sub-hdr { font-size: 12px; letter-spacing: 1px; color: var(--ds-color-primary); }
.servhub-app .modal-box { border-radius: var(--ds-radius-card); box-shadow: var(--ds-shadow-dialog); background: var(--ds-color-surface-raised); }
.servhub-app .modal-overlay { background: var(--ds-color-surface-overlay); }
.servhub-app .modal-title { font-size: 18px; font-weight: 700; }
.servhub-app .empty-title { font-size: 16px; }
.servhub-app .empty-sub { font-size: 14px; }
.servhub-app .toast { border-left-color: var(--ds-color-primary); font-size: 14px; background: var(--ds-color-surface-raised); }

/* ================= Buttons (sm 32 / md 40) ================= */
.servhub-app .btn { height: 40px; padding: 0 16px; font: 600 14px var(--ds-font-family); border-radius: var(--ds-radius-control); }
.servhub-app .btn-sm { height: 32px; padding: 0 12px; font-size: 13px; }
.servhub-app .btn-primary { background: var(--ds-color-primary); color: #fff; box-shadow: var(--ds-shadow-button); }
.servhub-app .btn-primary:hover { background: var(--ds-color-primary-700); box-shadow: var(--ds-shadow-button-hover); }
.servhub-app.dark .btn-primary:hover { background: #17b393; }
.servhub-app .btn-outline { color: var(--text-primary); border-color: var(--ds-color-border-strong); background: var(--ds-color-surface-raised); }
.servhub-app .btn-outline:hover { background: var(--ds-color-surface-hover); border-color: var(--ds-color-primary-300); color: var(--text-primary); }
.servhub-app .btn-ghost { color: var(--text-body); }
.servhub-app .btn-ghost:hover { background: var(--ds-color-surface-hover); }
.servhub-app .btn:focus-visible,
.servhub-app .seg-btn:focus-visible,
.servhub-app .sb-item:focus-visible { outline: none; box-shadow: var(--ds-focus-ring); }
.servhub-app .btn:disabled { opacity: .45; cursor: not-allowed; }

.servhub-app .seg-group { background: var(--ds-color-surface-recessed); padding: 3px; }
.servhub-app.dark .seg-group { background: #2a2b31; }
.servhub-app .seg-btn { font: 600 14px var(--ds-font-family); padding: 7px 14px; }
.servhub-app .seg-btn.active { background: var(--ds-color-primary); color: #fff; box-shadow: var(--ds-shadow-button); }
.servhub-app .theme-btn.active { background: var(--ds-color-primary); box-shadow: none; }

/* ================= Fields (44px) ================= */
.servhub-app .field-input { height: 44px; padding: 0 12px; font-size: 14px; border-radius: var(--ds-radius-control); border-color: var(--ds-color-neutral-300); background: var(--ds-color-surface-raised); }
.servhub-app textarea.field-input { height: auto; min-height: 88px; padding: 10px 12px; line-height: 1.5; }
.servhub-app .field-input:focus { border-color: var(--ds-color-primary); box-shadow: var(--ds-focus-ring); }
.servhub-app .field-lbl { font-size: 14px; font-weight: 600; text-transform: none; letter-spacing: 0; color: var(--text-body); margin-bottom: 6px; }
.servhub-app .field-err { font-size: 13px; }
.servhub-app.dark .field-input { background: rgba(255, 255, 255, .04); border-color: rgba(255, 255, 255, .12); }

/* ================= Tables (40px rows, 14px normal case) ================= */
.servhub-app .req-table { font-size: 14px; }
.servhub-app .req-table th { height: 40px; padding: 8px 16px; font: 600 14px var(--ds-font-family); text-transform: none; letter-spacing: 0; color: var(--text-body); background: var(--ds-color-neutral-50); }
.servhub-app .req-table td { height: 40px; padding: 8px 16px; }
.servhub-app .req-table tr:hover td { background: var(--ds-color-surface-hover); }
.servhub-app .req-table tbody tr[aria-selected="true"] td { background: var(--ds-color-surface-selected); }
.servhub-app.dark .req-table th { background: #202126; color: var(--text-body); }
/* Grid rows box: scrolls both ways; the column headers stick to its top (like the model-driven grid). */
.servhub-app .grid-scroll { overflow: auto; overscroll-behavior: contain; border-radius: var(--ds-radius-control); }
.servhub-app .content:has(.grid-scroll) { padding-top: 12px; padding-bottom: 16px; }
/* Table pages are dense like the model-driven app: slim header, command bar and view bar, so the
   height goes to the rows. */
.servhub-app .content:has(.grid-scroll) > .bento { padding: 12px 14px; }
.servhub-app .page-hdr.compact, .servhub-app.dark .page-hdr.compact { margin: 12px 24px 0; padding: 10px 16px; gap: 12px; border-radius: 14px; }
.servhub-app .page-hdr.compact .ph-icon { width: 34px; height: 34px; border-radius: 10px; }
.servhub-app .page-hdr.compact .ph-icon svg { width: 18px; height: 18px; }
.servhub-app .page-hdr.compact .ph-text { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 12px; }
.servhub-app .page-hdr.compact .page-title { font-size: 19px; }
.servhub-app .page-hdr.compact .page-sub { font-size: 13px; margin: 0; }
.servhub-app .grid-cmdbar, .servhub-app .grid-viewbar { margin-bottom: 8px; gap: 6px !important; }
.servhub-app .grid-cmdbar .btn, .servhub-app .grid-viewbar .btn { height: 34px; padding: 0 12px; font-size: 13.5px; }
.servhub-app .grid-viewbar .dd-btn, .servhub-app .grid-viewbar .field-input { height: 36px; min-height: 36px; }
.servhub-app .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* Sticky also anchors the resize handle (absolute) inside each header cell. */
.servhub-app .req-table thead th { position: sticky; top: 0; z-index: 2; }

/* ================= Tags & key/values ================= */
.servhub-app .sbadge { border-radius: var(--ds-radius-tag); font: 600 12px var(--ds-font-family); padding: 2px 8px; letter-spacing: 0; }
.servhub-app .sbadge-gold { background: var(--ds-status-info-bg); color: var(--ds-status-info-text); }
.servhub-app .sbadge-green { background: var(--ds-status-success-bg); color: var(--ds-status-success-text); }
.servhub-app .sbadge-amber { background: var(--ds-status-high-bg); color: var(--ds-status-high-text); }
.servhub-app .sbadge-red { background: var(--ds-status-urgent-bg); color: var(--ds-status-urgent-text); }
.servhub-app .sbadge-gray { background: var(--ds-status-draft-bg); color: var(--ds-status-draft-text); }
.servhub-app .kv-item { font-size: 14px; padding: 6px 0; }
.servhub-app .kv-item .k { font-size: 14px; color: var(--text-body); }
.servhub-app .kv-item .v { font-size: 14px; }
.servhub-app .section-note { font-size: 13px; }
.servhub-app .code-chip { border-radius: var(--ds-radius-tag); }
.servhub-app .table-pill { display: inline-block; margin-left: 8px; padding: 2px 11px; border-radius: 999px; background: var(--ds-color-surface-selected); color: var(--ds-color-primary-700); font-size: 12.5px; font-weight: 700; vertical-align: middle; }

/* ================= Pick cards / region options (hover tints were gold) ================= */
.servhub-app .pick-card:hover,
.servhub-app .type-tile:hover { border-color: var(--ds-color-primary-300); background: var(--ds-color-surface-selected); box-shadow: 0 10px 22px rgba(2, 54, 53, .1); }
.servhub-app .pick-card.selected,
.servhub-app .type-tile.selected { border-color: var(--ds-color-primary); background: var(--ds-color-surface-selected); box-shadow: 0 10px 22px rgba(2, 54, 53, .12); }
.servhub-app .pc-icon,
.servhub-app .tt-icon { box-shadow: 0 6px 14px rgba(2, 54, 53, .18); }
.servhub-app .pc-title { font-size: 15px; }
.servhub-app .pc-desc { font-size: 13px; }
.servhub-app.dark .pick-card:hover,
.servhub-app.dark .region-opt:hover,
.servhub-app.dark .ss-row:hover { background: rgba(64, 255, 184, .06); }
.servhub-app.dark ::selection { background: rgba(64, 255, 184, .3); }
.servhub-app ::selection { background: rgba(18, 110, 92, .2); }

/* ================= Service Hub specifics (app.css) ================= */
.servhub-app .hub-card:hover { border-color: var(--ds-color-primary-300); box-shadow: 0 10px 22px rgba(2, 54, 53, .1); }
.servhub-app .rich-text.ProseMirror:focus { border-color: var(--ds-color-primary); box-shadow: var(--ds-focus-ring); }
.servhub-app .hub-card-title { font-size: 16px; }
.servhub-app .hub-card-sub { font-size: 14px; }
.servhub-app .hub-card-meta { font-size: 13px; color: var(--ds-color-primary); }
.servhub-app .hub-count { display: inline-flex; align-items: center; width: fit-content; padding: 4px 12px; border-radius: 999px; background: var(--ds-color-surface-selected); border: 1px solid var(--ds-color-primary-line); font-size: 13px; font-weight: 700; color: var(--ds-color-primary-700); }
.servhub-app .hub-text { font-size: 14px; }
.servhub-app .hub-muted { font-size: 14px; }
.servhub-app .hub-link-btn { font-size: 14px; border-radius: 12px; }
.servhub-app .hub-link-btn:hover { background: var(--ds-color-surface-selected); border-color: var(--ds-color-primary-300); }
.servhub-app .hub-multi-opt { font-size: 14px; }
.servhub-app .hub-multi-opt:hover { background: var(--ds-color-surface-hover); }
.servhub-app .hub-page .field-lbl { color: var(--text-body); }
.servhub-app .hub-fee-list li { font-size: 15px; background: var(--ds-color-surface-muted); border: 1px solid var(--border); }
.servhub-app .hub-fee-list li.first { background: var(--ds-color-surface-selected); box-shadow: inset 0 0 0 1.5px var(--ds-color-primary-300); }
.servhub-app .hub-fee-amount { color: var(--ds-color-primary-700); }
.servhub-app.dark .hub-fee-amount { color: #7ce8c1; }
.servhub-app .hub-doctor-photo { border-color: var(--ds-color-primary-soft); }
.servhub-app .text-size-btn.active { background: var(--ds-color-primary-mint); color: #023635; }
.servhub-app .text-size-toggle { background: rgba(255, 255, 255, .08); }

@media (prefers-reduced-motion: reduce) {
  .servhub-app *, .servhub-app *::before, .servhub-app *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}

/* ================= Dropdown (replaces native <select>, same look as the Business Unit picker) ================= */
.servhub-app .dd { position: relative; min-width: 0; }
.servhub-app .dd-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; text-align: start; cursor: pointer; }
.servhub-app .dd-btn:disabled { cursor: not-allowed; opacity: .55; background: var(--ds-color-surface-recessed); }
.servhub-app .dd-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.servhub-app .dd-value.placeholder { color: var(--muted); }
.servhub-app .dd-arrow { display: inline-block; flex: none; font-size: 9px; color: var(--muted); transition: transform var(--ds-duration-fast) var(--ds-ease-settle); }
.servhub-app .dd.open .dd-arrow { transform: rotate(180deg); color: var(--ds-color-primary); }
.servhub-app .dd.open .dd-btn { border-color: var(--ds-color-primary); box-shadow: var(--ds-focus-ring); }
.servhub-app .dd-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; min-width: 180px; z-index: 60; background: var(--ds-color-surface-raised); border: 1px solid var(--ds-color-border-strong); border-radius: 12px; box-shadow: var(--ds-shadow-dialog), 0 12px 28px rgba(2, 54, 53, .12); padding: 4px; }
.servhub-app .dd-list { max-height: 280px; overflow-y: auto; }
.servhub-app .dd-menu.dd-list { max-height: 300px; }
.servhub-app .dd-search { position: relative; margin: 2px 2px 6px; }
.servhub-app .dd-search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.servhub-app .dd-search input { width: 100%; height: 36px; padding: 0 10px 0 30px; border: 1px solid var(--ds-color-neutral-300); border-radius: var(--ds-radius-control); font: 14px var(--ds-font-family); color: var(--text-primary); background: var(--ds-color-surface-muted); outline: none; }
.servhub-app .dd-search input:focus { border-color: var(--ds-color-primary); box-shadow: var(--ds-focus-ring); }
.servhub-app .dd-group { padding: 8px 10px 4px; font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--ds-color-primary); }
.servhub-app .dd-opt { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; padding: 7px 10px; border-radius: var(--ds-radius-control); font-size: 14px; color: var(--text-primary); cursor: pointer; }
.servhub-app .dd-opt-label { overflow-wrap: anywhere; }
.servhub-app .dd-opt.active,
.servhub-app .dd-opt:hover { background: var(--ds-color-surface-hover); }
.servhub-app .dd-opt.selected { color: var(--ds-color-primary); font-weight: 600; background: var(--ds-color-surface-selected); }
.servhub-app .dd-opt svg { flex: none; }
.servhub-app .dd-empty { padding: 10px; font-size: 14px; color: var(--muted); }
/* Multi-select rows (Business Unit) share the option look. */
.servhub-app .dd-check { justify-content: flex-start; }
.servhub-app .dd-check input { accent-color: var(--ds-color-primary); width: 16px; height: 16px; }
.servhub-app .dd-check.group { font-weight: 700; }
.servhub-app .dd-check.child { padding-inline-start: 28px; }

/* ================= Scrollbars (thin, teal thumb on a light track) ================= */
.servhub-app,
.servhub-app * { scrollbar-width: thin; scrollbar-color: rgba(18, 110, 92, .45) transparent; }
.servhub-app.dark,
.servhub-app.dark * { scrollbar-color: rgba(64, 255, 184, .35) transparent; }
.servhub-app .sidebar { scrollbar-width: none; }

/* Inputs with a leading icon (base.css .search-select / .cselect): keep room for the icon after the
   Synapse 12px field padding above. */
.servhub-app .search-select .field-input { padding-left: 36px; padding-right: 30px; }
.servhub-app .search-select .ss-icon,
.servhub-app .cselect .cs-icon { left: 12px; display: inline-flex; align-items: center; color: var(--muted); }
.servhub-app .search-select .ss-icon svg { width: 16px; height: 16px; }
.servhub-app .cselect .field-input { padding-left: 36px; padding-right: 48px; }

/* Back links ("← Back to …") look like the light (outline) buttons, so they read as buttons. */
.servhub-app .back-link { display: inline-flex; align-items: center; gap: 8px; height: 38px; margin-bottom: 12px; padding: 0 14px; border: 1px solid var(--ds-color-border-strong); border-radius: var(--ds-radius-control); background: var(--ds-color-surface-raised); box-shadow: 0 1px 2px rgba(2, 54, 53, .05); font: 600 14px var(--ds-font-family); letter-spacing: 0; text-transform: none; color: var(--text-primary); cursor: pointer; transition: background var(--ds-duration-fast), border-color var(--ds-duration-fast); }
.servhub-app .back-link:hover { background: var(--ds-color-surface-hover); border-color: var(--ds-color-primary-300); color: var(--text-primary); }
.servhub-app .back-link svg { width: 16px; height: 16px; transition: transform var(--ds-duration-fast); }
.servhub-app .back-link:hover svg { transform: translateX(-2px); }
.servhub-app .back-link:focus-visible { outline: none; box-shadow: var(--ds-focus-ring); }
.servhub-app.dark .back-link { color: var(--text-primary); }
.servhub-app .hub-link-ext { margin-left: auto; flex: none; opacity: .55; }

/* ================= Grid filters (model-driven behaviour) ================= */
/* "Filter by" callout under a column header */
.servhub-app .col-filter { position: fixed; z-index: 420; width: 300px; display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--ds-color-surface-raised); border: 1px solid var(--ds-color-border-strong); border-radius: 12px; box-shadow: var(--ds-shadow-dialog), 0 12px 28px rgba(2, 54, 53, .14); }
.servhub-app .col-filter-title { font: 700 15px var(--ds-font-family); color: var(--text-primary); }
.servhub-app .col-filter-value .field-input { width: 100%; }
.servhub-app .col-filter-value > div { max-height: 220px; overflow-y: auto; }
.servhub-app .col-filter-actions { display: flex; gap: 8px; }
.servhub-app .col-filter-actions .btn { flex: 1; }
.servhub-app .col-filtered-icon { color: var(--ds-color-primary); flex: none; }

/* "Edit filters" as a right-side panel (the grid stays visible) */
.servhub-app .side-panel-overlay { justify-content: flex-end; align-items: stretch; background: rgba(3, 17, 15, .18); backdrop-filter: none; }
.servhub-app .side-panel { width: min(820px, 100vw); max-width: none; height: 100vh; border-radius: 0; display: flex; flex-direction: column; animation: sidePanelIn .22s var(--ds-ease-settle); }
.servhub-app .side-panel .modal-body { flex: 1; overflow-y: auto; }
/* A condition is one row like the model-driven app: field | operator | value | delete. */
.servhub-app .side-panel .attach-row { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.3fr) auto !important; }
@media (max-width: 700px) {
  .servhub-app .side-panel .attach-row { grid-template-columns: 1fr 1fr !important; }
  .servhub-app .side-panel .attach-row > :nth-child(3) { grid-column: 1 / 2; }
}
@keyframes sidePanelIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }

/* Lookup filter value: record chips + search */
.servhub-app .lookup-pick { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.servhub-app .lookup-pick-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.servhub-app .lookup-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px; background: var(--ds-color-surface-selected); box-shadow: inset 0 0 0 1px var(--ds-color-primary-line); font-size: 13px; font-weight: 600; color: var(--ds-color-primary-700); }
.servhub-app .lookup-chip button { display: inline-flex; padding: 1px; border: none; background: none; color: inherit; cursor: pointer; opacity: .7; }
.servhub-app .lookup-chip button:hover { opacity: 1; color: var(--ds-color-danger); }
.servhub-app .lookup-pick-search { position: relative; }
.servhub-app .lookup-pick-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.servhub-app .lookup-pick-search .field-input { padding-left: 34px; }
.servhub-app .lookup-pick .dd-menu { top: auto; position: relative; margin-top: 2px; }

/* Grid header: sort arrow always visible when sorted; menu chevron only on hover/focus (MDA-like). */
.servhub-app .col-sort-icon { color: var(--ds-color-primary); flex: none; }
.servhub-app .col-menu-chevron { flex: none; opacity: 0; transition: opacity var(--ds-duration-fast); }
.servhub-app .req-table th:hover .col-menu-chevron,
.servhub-app .req-table th button:focus-visible .col-menu-chevron,
.servhub-app .req-table th button[aria-expanded="true"] .col-menu-chevron { opacity: .7; }
/* Lookup results: the Lookup View's extra columns under the name (model-driven style). */
.servhub-app .ss-row-detail { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
/* Long dialogs (record form…): the header — title, command bar, tabs — stays on top while the body scrolls,
   like a frozen row in Excel. */
.servhub-app .detail-modal-box > .modal-hdr { position: sticky; top: 0; z-index: 6; background: var(--ds-color-surface-raised); padding-bottom: 12px; border-bottom: 1px solid var(--border); box-shadow: 0 6px 12px -10px rgba(2, 54, 53, .25); }
/* Sidebar sections fold / unfold (model-driven sitemap groups). */
.servhub-app .sb-group-toggle { display: flex; align-items: center; justify-content: space-between; width: calc(100% - 12px); border: none; background: none; cursor: pointer; text-align: left; font-family: inherit; }
.servhub-app .sb-group-toggle:hover { color: var(--sidebar-text-active); }
.servhub-app .sb-group-toggle:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: -2px; border-radius: 6px; }
.servhub-app .sb-group-chevron { transition: transform .2s; }
.servhub-app .sb-group-toggle.collapsed .sb-group-chevron { transform: rotate(-90deg); }
````

### `src/styles/hub-cards.css`

````css
/*
  Service Hub card system (Synapse look) — loaded after synapse.css.
  Shared pieces: .sc-* (title / Arabic / top tags), .card-meta (icon + text lines), .card-price,
  .card-code (copyable code). Page cards: specialties (.sp-*), COE rows (.coe-*), locations (.loc-*).
*/

.servhub-app .hub-card { padding: 18px; border: 1px solid var(--border); box-shadow: 0 1px 2px rgba(2, 54, 53, .04), 0 8px 20px rgba(82, 82, 100, .06); transition: transform var(--ds-duration-fast) var(--ds-ease-settle), box-shadow var(--ds-duration-fast) var(--ds-ease-settle), border-color var(--ds-duration-fast); }
.servhub-app .hub-card:hover { transform: translateY(-2px); }
.servhub-app .hub-grid { gap: 16px; }

/* ---- Card pieces ---- */
.servhub-app .sc-card { display: flex; flex-direction: column; gap: 8px; }
.servhub-app .sc-top { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 24px; }
.servhub-app .sc-title { font: 700 16px/1.35 var(--ds-font-family); color: var(--text-primary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.servhub-app .sc-ar { font-size: 14px; color: var(--text-body); text-align: right; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.servhub-app .card-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 14px; color: var(--text-body); }
.servhub-app .card-meta-stack { flex-direction: column; }
.servhub-app .card-meta-item { display: inline-flex; align-items: flex-start; gap: 6px; min-width: 0; }
.servhub-app .card-meta-icon { display: inline-flex; color: var(--ds-color-primary); margin-top: 2px; flex: none; }
.servhub-app .card-price { margin-top: auto; padding-top: 12px; border-top: 1px dashed var(--border); display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
.servhub-app .card-price-label { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--muted); }
.servhub-app .card-price-values { display: flex; flex-direction: column; align-items: flex-end; }
.servhub-app .card-price-before { font-size: 13px; color: var(--muted); }
.servhub-app .card-price-amount { font: 700 22px/1.1 var(--ds-font-family); color: var(--ds-color-primary-700); white-space: nowrap; }
.servhub-app.dark .card-price-amount { color: #7ce8c1; }
.servhub-app .card-price-amount small { font-size: 13px; font-weight: 600; color: var(--muted); }
.servhub-app .card-price-amount.na { font-size: 16px; color: var(--muted); }
.servhub-app .card-code { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--ds-color-surface-recessed); font: 600 12.5px var(--mono); color: var(--text-body); cursor: pointer; transition: all var(--ds-duration-fast); }
.servhub-app .card-code:hover { border-color: var(--ds-color-primary-300); color: var(--ds-color-primary); }
.servhub-app .card-code.copied { border-color: var(--ds-color-primary); color: var(--ds-color-primary); background: var(--ds-color-surface-selected); }
.servhub-app.dark .card-code { background: #2a2b31; }

/* ---- Specialties ---- */
.servhub-app .sp-grid { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.servhub-app .sp-card { display: flex; flex-direction: row; align-items: center; gap: 14px; width: 100%; text-align: left; cursor: pointer; font: inherit; color: inherit; }
.servhub-app .sp-card:focus-visible { outline: none; box-shadow: var(--ds-focus-ring); }
.servhub-app .sp-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.servhub-app .sp-name { font: 700 16px var(--ds-font-family); color: var(--text-primary); }
.servhub-app .sp-ar { font-size: 14px; color: var(--text-body); text-align: left; }
.servhub-app .sp-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.servhub-app .sp-go { flex: none; color: var(--muted); transition: transform var(--ds-duration-fast), color var(--ds-duration-fast); }
.servhub-app .sp-card:hover .sp-go { color: var(--ds-color-primary); transform: translateX(3px); }

/* ---- COE: one center per row ---- */
.servhub-app .coe-card { padding: 0; }
.servhub-app .coe-card:hover { transform: none; }
.servhub-app .coe-card > summary { display: flex; align-items: flex-start; gap: 16px; padding: 18px 20px; cursor: pointer; list-style: none; }
.servhub-app .coe-card > summary::after { margin: 14px 0 0 auto; }
.servhub-app .coe-icon { flex: none; width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #1a8a73 0%, #0d594b 100%); color: #fff; box-shadow: var(--ds-shadow-button); }
.servhub-app .coe-head { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
.servhub-app .coe-name { font: 700 18px var(--ds-font-family); color: var(--text-primary); }
.servhub-app .coe-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.servhub-app .hub-fold.coe-card > :not(summary) { padding: 0 20px 20px 88px; }
.servhub-app .coe-body { display: flex; flex-direction: column; gap: 14px; }
.servhub-app .coe-blocks { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.servhub-app .coe-block { background: var(--ds-color-surface-muted); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
@media (max-width: 720px) { .servhub-app .hub-fold.coe-card > :not(summary) { padding: 0 16px 16px; } }

/* ---- Locations ---- */
.servhub-app .loc-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.servhub-app .loc-cover { position: relative; height: 190px; overflow: hidden; }
.servhub-app .loc-cover img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.servhub-app .loc-cover { background: radial-gradient(260px 160px at 20% 10%, rgba(64, 255, 184, .25), transparent 70%), linear-gradient(135deg, #0d594b 0%, #023635 100%); }
.servhub-app .loc-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(216, 248, 235, .8); }
.servhub-app .loc-area { position: absolute; left: 12px; bottom: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(2, 54, 53, .78); color: #fff; font: 600 13px var(--ds-font-family); }
.servhub-app .loc-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.servhub-app .loc-actions { margin-top: auto; display: flex; flex-wrap: wrap; gap: 8px; padding-top: 4px; }
.servhub-app .loc-actions .btn { flex: 1 1 auto; }

/* Buttons rendered as links */
.servhub-app a.btn, .servhub-app a.btn:hover { text-decoration: none; }

/* ---- Labelled fields (legacy "CODE: value" rows) ---- */
.servhub-app .card-fields { margin: 4px 0 0; display: flex; flex-direction: column; }
.servhub-app .card-field { display: grid; grid-template-columns: minmax(128px, 42%) 1fr; gap: 10px; align-items: baseline; padding: 6px 0; border-bottom: 1px dashed var(--border); }
.servhub-app .card-field:last-child { border-bottom: none; }
.servhub-app .card-field dt { font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-body); }
.servhub-app .card-field dd { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }
.servhub-app .card-field dd.strong { font-size: 17px; font-weight: 700; color: var(--ds-color-primary-700); }
.servhub-app.dark .card-field dd.strong { color: #7ce8c1; }
.servhub-app .card-field .card-code { vertical-align: middle; }
.servhub-app .coe-head .card-fields { max-width: 720px; }
.servhub-app .coe-head .card-field { grid-template-columns: 170px 1fr; }

/* Code and price values as pills, like the legacy "Consultation Fees" badge. */
.servhub-app .card-field .card-code,
.servhub-app .card-field dd.strong > .card-pill { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 5px 12px; border: none; border-radius: 8px; background: var(--ds-color-surface-selected); font: 700 14px/1.3 var(--ds-font-family); color: var(--ds-color-primary-700); text-align: start; white-space: normal; overflow-wrap: anywhere; box-shadow: inset 0 0 0 1px var(--ds-color-primary-line); }
.servhub-app .card-field .card-code svg { flex: none; opacity: .7; }
.servhub-app .card-field .card-code:hover { box-shadow: inset 0 0 0 1.5px var(--ds-color-primary-300); }
.servhub-app .card-field .card-code.copied { background: var(--ds-status-success-bg); color: var(--ds-status-success-text); }
.servhub-app .card-field dd.strong > .card-pill { font-size: 16px; }
.servhub-app.dark .card-field .card-code,
.servhub-app.dark .card-field dd.strong > .card-pill { color: #7ce8c1; }

/* Specialty card: text only, teal accent bar on the left (no letter avatar). */
.servhub-app .sp-card { position: relative; padding-left: 22px; }
.servhub-app .sp-card::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 4px; border-radius: 0 4px 4px 0; background: linear-gradient(180deg, #1a8a73 0%, #0d594b 100%); transition: top var(--ds-duration-fast), bottom var(--ds-duration-fast); }
.servhub-app .sp-card:hover::before { top: 8px; bottom: 8px; }

/* ---- COE v2: blocks one per row; header fields as pills (user choice 2026-09-29) ---- */
.servhub-app .coe-blocks { display: flex; flex-direction: column; gap: 12px; }
.servhub-app .coe-block { background: var(--ds-color-surface-muted); border: 1px solid var(--border); border-left: 3px solid var(--ds-color-primary); border-radius: 10px; padding: 12px 16px; }
.servhub-app .coe-block-title { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--ds-color-primary); margin-bottom: 6px; }
.servhub-app .coe-fields { margin: 2px 0 0; }
.servhub-app .coe-field dt { font-size: 11.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-body); }
.servhub-app .coe-field dd { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }

/* Header fields: one wrapping line of "Label: value" capsules */
.servhub-app .coe-fields-pills { display: flex; flex-wrap: wrap; gap: 6px; }
.servhub-app .coe-fields-pills .coe-field { display: inline-flex; align-items: baseline; gap: 6px; padding: 5px 12px; border-radius: 999px; background: var(--ds-color-surface-selected); box-shadow: inset 0 0 0 1px var(--ds-color-primary-line); }
.servhub-app .coe-fields-pills dt { font-size: 11px; color: var(--ds-color-primary); }
.servhub-app .coe-fields-pills dt::after { content: ':'; }
.servhub-app .coe-fields-pills dd { font-size: 14px; }


/* ---- Locations without a photo: "Map" look (user choice 2026-09-29) ---- */
.servhub-app .loc-cover.loc-ph-map { height: 160px; }
.servhub-app .loc-cover.loc-ph-map {
  background:
    linear-gradient(115deg, transparent 46%, rgba(255, 255, 255, .95) 46%, rgba(255, 255, 255, .95) 49%, transparent 49%),
    linear-gradient(25deg, transparent 60%, rgba(255, 255, 255, .9) 60%, rgba(255, 255, 255, .9) 62.5%, transparent 62.5%),
    repeating-linear-gradient(0deg, rgba(18, 110, 92, .07) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(90deg, rgba(18, 110, 92, .07) 0 1px, transparent 1px 22px),
    linear-gradient(135deg, #e3f3ec 0%, #eef6f3 100%);
}
.servhub-app .loc-ph-map-pin { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); color: var(--ds-color-primary); filter: drop-shadow(0 6px 8px rgba(2, 54, 53, .25)); }
.servhub-app .loc-cover.loc-ph-map .loc-area { background: var(--ds-color-primary); }
.servhub-app.dark .loc-cover.loc-ph-map { background: linear-gradient(135deg, rgba(64, 255, 184, .08) 0%, rgba(64, 255, 184, .03) 100%); }

/* Context bar: "Doctors · Orthopedics" when a list is opened from a specialty / clinic hub. */
.servhub-app .ctx-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; padding: 10px 14px; border-radius: 12px; background: var(--ds-color-surface-selected); border: 1px solid var(--ds-color-primary-line); }
.servhub-app .ctx-text { display: inline-flex; align-items: baseline; gap: 8px; min-width: 0; font-family: var(--ds-font-family); }
.servhub-app .ctx-kind { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--ds-color-primary); }
.servhub-app .ctx-sep { color: var(--muted); }
.servhub-app .ctx-name { font-size: 17px; font-weight: 700; color: var(--text-primary); }
.servhub-app .ctx-bar .btn { gap: 6px; }



/* ---- Bank account card: full-width "Band" design (user choice, 2026-09-30) ---- */
.servhub-app .bank-card { border: 1px solid var(--border); border-radius: var(--ds-radius-card); background: var(--ds-color-surface-raised); overflow: hidden; box-shadow: 0 1px 2px rgba(2, 54, 53, .04), 0 8px 20px rgba(82, 82, 100, .06); }
.servhub-app .bank-name { font-size: 18px; font-weight: 700; color: var(--text-primary); }
.servhub-app .bank-sub { font-size: 13px; color: var(--muted); }
.servhub-app .bank-label { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--text-body); }
.servhub-app .bank-mono { font-family: var(--mono); font-size: 15px; font-weight: 600; letter-spacing: .6px; color: var(--text-primary); overflow-wrap: anywhere; }
.servhub-app .bank-text { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.servhub-app .bank-copy { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 6px 12px; border: 1px solid var(--ds-color-primary-line); border-radius: 999px; background: var(--ds-color-surface-raised); color: var(--ds-color-primary); font: 600 12.5px var(--ds-font-family); cursor: pointer; transition: background .15s, border-color .15s; }
.servhub-app .bank-copy:hover { background: var(--ds-color-surface-selected); border-color: var(--ds-color-primary); }
.servhub-app .bank-copy.done { background: var(--ds-color-primary); border-color: var(--ds-color-primary); color: #fff; }
.servhub-app .bank-notes { padding: 16px 22px 20px; border-top: 1px solid var(--border); background: var(--ds-color-surface-muted); }
.servhub-app .bank-notes .bank-label { margin-bottom: 6px; }

.servhub-app .bank-band-hdr { display: flex; align-items: center; gap: 14px; padding: 18px 22px; background: linear-gradient(90deg, #063b36, #0d594b); color: #fff; }
.servhub-app .bank-band-hdr .bank-name { color: #fff; }
.servhub-app .bank-band-hdr .bank-sub { color: rgba(255, 255, 255, .75); }
.servhub-app .bank-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; padding: 18px 22px; }
.servhub-app .bank-tile { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--ds-color-surface-raised); }
.servhub-app .bank-tile-value { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 34px; }

/* The CPG card last opened (legacy .cpg-card.active). */
.servhub-app .hub-card-active { border-color: var(--ds-color-primary); background: var(--ds-color-surface-selected); }

/* ---- Info cards (Egypt Quick Links: Insurance, Booking Policy, QA Tips, CRM Dictionary, Working Hours) ----
   One card per row, full width, "Band" design (user choice, 2026-09-30). */
.servhub-app .info-list { display: flex; flex-direction: column; gap: 14px; }
.servhub-app .info-card { border: 1px solid var(--border); border-radius: var(--ds-radius-card); background: var(--ds-color-surface-raised); overflow: hidden; box-shadow: 0 1px 2px rgba(2, 54, 53, .04), 0 8px 20px rgba(82, 82, 100, .06); }
.servhub-app .info-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.servhub-app .info-title { font-size: 17px; font-weight: 700; color: var(--text-primary); }
.servhub-app .info-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
.servhub-app .info-tag { padding: 3px 11px; border-radius: 999px; background: var(--ds-color-surface-selected); color: var(--ds-color-primary-700); font-size: 12.5px; font-weight: 700; }
.servhub-app .info-label { font-size: 12px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--text-body); margin-bottom: 6px; }
.servhub-app .info-value { font-size: 15px; color: var(--text-primary); line-height: 1.7; }
.servhub-app .info-fold > summary { cursor: pointer; list-style: none; }
.servhub-app .info-fold > summary::-webkit-details-marker { display: none; }
.servhub-app .info-fold > summary::after { content: '▼'; font-size: 11px; opacity: .7; transition: transform .2s; }
.servhub-app .info-fold[open] > summary::after { transform: rotate(180deg); }
.servhub-app .info-fold:not([open]) > .info-head { border-bottom: none; }

.servhub-app .info-band .info-head { padding: 16px 22px; background: linear-gradient(90deg, #063b36, #0d594b); }
.servhub-app .info-band .info-title { color: #fff; }
.servhub-app .info-band .info-tag { background: rgba(255, 255, 255, .16); color: #fff; }
.servhub-app .info-band .info-fold > summary::after, .servhub-app .info-band.info-fold > summary::after { color: #fff; }
.servhub-app .info-band .info-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; padding: 18px 22px; }
.servhub-app .info-band .info-section { padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; }

/* ---- Filter panel (every hub page): "Pills" design, user choice 2026-09-30 ----
   Each filter a rounded chip with its label inside, in a wrapping row; the search box (and Refresh)
   last, under the chips. */
.servhub-app .filter-panel { padding: 0; overflow: visible; }
.servhub-app .fp-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 20px; border-bottom: 1px solid var(--border); }
.servhub-app .fp-title { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
.servhub-app .fp-clear { margin-left: auto; }
.servhub-app .filter-panel .hub-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 20px 16px; }
.servhub-app .filter-panel .hub-filter { flex-direction: row; align-items: center; gap: 2px; height: 38px; padding: 0 4px 0 14px; border: 1px solid var(--border); border-radius: 999px; background: var(--ds-color-surface-raised); transition: border-color .15s; }
.servhub-app .filter-panel .hub-filter:hover, .servhub-app .filter-panel .hub-filter:focus-within { border-color: var(--ds-color-primary); }
.servhub-app .filter-panel .hub-filter .field-lbl { margin: 0; white-space: nowrap; font-size: 12px; font-weight: 700; color: var(--muted); }
.servhub-app .filter-panel .hub-filter .field-input, .servhub-app .filter-panel .hub-filter .dd-btn { height: 34px; min-height: 34px; border: none; box-shadow: none; background: transparent; padding-top: 0; padding-bottom: 0; }
/* Search last: at the end of the chips' row when it fits, else on the next line, with Refresh beside it. */
.servhub-app .filter-panel .hub-search { order: 10; flex: 1 1 280px; }
.servhub-app .filter-panel .hub-search .hub-search-wrap { flex: 1; }
.servhub-app .filter-panel .hub-filters > .btn { order: 11; border-radius: 999px; height: 38px; }
/* With a filter applied, "Clear All Filters" turns primary teal and gives one small shake as it enables,
   so the user notices results are filtered. */
.servhub-app .fp-clear:not(:disabled) { background: var(--ds-color-primary); border-color: var(--ds-color-primary); color: #fff; animation: fpClearNudge .5s ease-in-out 1; }
.servhub-app .fp-clear:not(:disabled):hover { background: var(--ds-color-primary-700); border-color: var(--ds-color-primary-700); box-shadow: 0 0 0 3px var(--ds-color-primary-line); }
@keyframes fpClearNudge {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-3px) rotate(-1.5deg); }
  40% { transform: translateX(3px) rotate(1.5deg); }
  60% { transform: translateX(-2px) rotate(-1deg); }
  80% { transform: translateX(2px) rotate(1deg); }
}
@media (prefers-reduced-motion: reduce) { .servhub-app .fp-clear:not(:disabled) { animation: none; } }

/* ---- Section bar (Doctors, Services, …): "Segment" design (user choice 2026-09-30), centred.
   One rounded track on one line (scrolls sideways when narrow); the active section a filled pill. ---- */
.servhub-app .hub-nav { display: flex; flex-wrap: nowrap; gap: 2px; width: fit-content; max-width: 100%; margin: 0 auto 16px; overflow-x: auto; padding: 4px; background: var(--ds-color-surface-muted); border: 1px solid var(--border); border-radius: 999px; scrollbar-width: thin; }
.servhub-app .hn-item { display: inline-flex; align-items: center; gap: 6px; flex: none; white-space: nowrap; padding: 8px 8px; border: none; border-radius: 999px; background: none; cursor: pointer; font: 600 13.5px var(--ds-font-family); color: var(--text-body); transition: background .15s, color .15s, box-shadow .15s; }
.servhub-app .hn-item:hover { background: var(--ds-color-surface-raised); color: var(--text-primary); }
.servhub-app .hn-item.active { background: var(--ds-color-primary); color: #fff; box-shadow: 0 4px 10px rgba(18, 110, 92, .25); }
.servhub-app .hn-item:focus-visible { outline: 2px solid var(--ds-color-primary); outline-offset: 2px; }

/* ---- Region choice (Service Hub landing and the change-region dialog): two tiles with the
   region code as a large watermark. ---- */
.servhub-app .rl { max-width: 980px; margin: 0 auto; }
.servhub-app .rl-grid { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.servhub-app .rl-card { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; gap: 18px; min-height: 240px; padding: 26px; text-align: left; cursor: pointer; font-family: var(--ds-font-family); color: var(--text-primary); background: var(--ds-color-surface-raised); border: 1px solid var(--border); border-radius: var(--ds-radius-card); box-shadow: 0 1px 2px rgba(2, 54, 53, .04), 0 8px 20px rgba(82, 82, 100, .06); transition: transform .2s, box-shadow .2s, border-color .2s; }
.servhub-app .rl-card:hover { transform: translateY(-3px); border-color: var(--ds-color-primary-line); box-shadow: var(--ds-shadow-sm); }
.servhub-app .rl-card:focus-visible { outline: none; box-shadow: var(--ds-focus-ring); }
.servhub-app .rl-card.current { border-color: var(--ds-color-primary); }
.servhub-app .rl-watermark { position: absolute; right: -10px; bottom: -34px; font-size: 150px; font-weight: 800; line-height: 1; color: var(--ds-color-primary); opacity: .07; pointer-events: none; transition: opacity .2s; }
.servhub-app .rl-card:hover .rl-watermark { opacity: .13; }
.servhub-app .rl-top { display: flex; align-items: center; gap: 14px; }
.servhub-app .rl-mark { width: 52px; height: 52px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 14px; font-weight: 800; font-size: 18px; letter-spacing: .5px; color: #fff; background: linear-gradient(135deg, var(--ds-color-primary-500), var(--ds-color-primary-800)); }
.servhub-app .rl-title { display: flex; flex-direction: column; gap: 2px; }
.servhub-app .rl-name { font-size: 24px; font-weight: 700; }
.servhub-app .rl-code { font-size: 12px; font-weight: 700; letter-spacing: 1px; color: var(--muted); }
.servhub-app .rl-line { font-size: 14px; color: var(--text-body); }
.servhub-app .rl-line b { color: var(--ds-color-primary-700); }
.servhub-app .rl-go { position: relative; align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 999px; font-size: 14px; font-weight: 700; color: #fff; background: var(--ds-color-primary); box-shadow: var(--ds-shadow-button); }
.servhub-app .rl-go svg { transition: transform .2s; }
.servhub-app .rl-card:hover .rl-go svg { transform: translateX(3px); }

/* In the dialog: smaller tiles, side by side. */
.servhub-app .region-modal .rl-grid { gap: 10px; margin-bottom: 12px; }
.servhub-app .region-modal .rl-card { min-height: 0; padding: 16px; gap: 12px; }
.servhub-app .region-modal .rl-top { flex-direction: column; align-items: flex-start; gap: 10px; }
.servhub-app .region-modal .rl-mark { width: 40px; height: 40px; font-size: 14px; border-radius: 11px; }
.servhub-app .region-modal .rl-name { font-size: 17px; }
.servhub-app .region-modal .rl-line { font-size: 12.5px; }
.servhub-app .region-modal .rl-go { font-size: 12.5px; padding: 7px 12px; }
.servhub-app .region-modal .rl-watermark { font-size: 96px; bottom: -22px; }

@media (max-width: 720px) {
  .servhub-app .rl .rl-grid { grid-template-columns: 1fr; }
  .servhub-app .rl .rl-card { min-height: 190px; }
}

/* ---- Service Hub landing: the rendered glass map disc (src/assets/region-disc.jpg), tinted to the
   system teal, with a glass pin and card per region. The pin's tip sits on the region; the card
   (name, currency, Open button) floats beside it. Phones get the tiles instead. ---- */
.servhub-app .rmap-stage { position: relative; overflow: hidden; padding: 24px; border-radius: var(--ds-radius-card);
  background:
    radial-gradient(420px 260px at 8% 92%, rgba(255, 214, 160, .22), transparent 70%),
    radial-gradient(380px 240px at 92% 80%, rgba(64, 255, 184, .10), transparent 70%),
    linear-gradient(180deg, #edf1f2 0%, #dfe4e6 55%, #cfd6d8 100%); /* matches the render's own backdrop */
  border: 1px solid var(--border); box-shadow: var(--ds-shadow-sm); }

.servhub-app .rmap { position: relative; width: min(1100px, 100%); margin: 0 auto; aspect-ratio: 1470 / 704; isolation: isolate; }
.servhub-app .rmap-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; user-select: none;
  /* Feather every edge so the photo melts into the stage. */
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent), linear-gradient(180deg, transparent, #000 12%, #000 88%, transparent);
  mask-composite: intersect; }
/* "Sage" (user choice 2026-10-04): a light teal hue over the silver glass; the render keeps its light and depth. */
.servhub-app .rmap-tint { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color; opacity: .2;
  background: radial-gradient(ellipse 31% 40% at 50% 49%, var(--ds-color-primary-700) 0%, var(--ds-color-primary-700) 70%, transparent 100%); }
/* A soft light on each region, stronger when its pin is hovered. */
.servhub-app .rmap-glow { position: absolute; width: 15%; aspect-ratio: 1.6; transform: translate(-50%, -38%); border-radius: 50%; pointer-events: none;
  background: radial-gradient(closest-side, var(--ds-color-primary-500), transparent); mix-blend-mode: multiply; opacity: .3; transition: opacity .25s; }
.servhub-app .rmap-glow.hover { opacity: .55; }

.servhub-app .rmap-pin { position: absolute; width: 0; height: 0; padding: 0; border: none; background: none; cursor: pointer; font-family: var(--ds-font-family); }
.servhub-app .rmap-pin:focus-visible { outline: none; }
.servhub-app .rmap-pin:focus-visible .rmap-label { box-shadow: var(--ds-focus-ring), var(--ds-shadow-sm); }
/* Teardrop: a square with three round corners, turned so the sharp corner points down at the spot. */
.servhub-app .rmap-drop { position: absolute; left: -38px; bottom: 12px; width: 76px; height: 76px; display: flex; align-items: center; justify-content: center;
  border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  background: linear-gradient(135deg, rgba(255, 255, 255, .9), rgba(255, 255, 255, .4)); border: 1px solid rgba(255, 255, 255, .95);
  box-shadow: 0 16px 28px rgba(2, 54, 53, .22), inset 0 1px 0 #fff; backdrop-filter: blur(8px); transition: transform .25s var(--ds-ease-settle); }
.servhub-app .rmap-mark { transform: rotate(45deg); width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; border-radius: 14px;
  font-weight: 800; font-size: 18px; letter-spacing: .5px; color: #fff; background: linear-gradient(135deg, var(--ds-color-primary-500), var(--ds-color-primary-800));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3); }
.servhub-app .rmap-pin::after { content: ''; position: absolute; left: -15px; top: -5px; width: 30px; height: 10px; border-radius: 50%; background: rgba(2, 54, 53, .3); filter: blur(3px); }
.servhub-app .rmap-pin:hover .rmap-drop, .servhub-app .rmap-pin:focus-visible .rmap-drop { transform: translateY(-8px) rotate(-45deg); }

.servhub-app .rmap-label { position: absolute; bottom: 36px; display: flex; flex-direction: column; gap: 5px; width: max-content; max-width: 250px; padding: 14px 18px;
  border-radius: 16px; background: linear-gradient(145deg, rgba(255, 255, 255, .78), rgba(255, 255, 255, .5)); border: 1px solid rgba(255, 255, 255, .95);
  box-shadow: 0 18px 40px rgba(2, 54, 53, .14), inset 0 1px 0 #fff; backdrop-filter: blur(14px);
  transition: transform .25s var(--ds-ease-settle), border-color .2s; }
.servhub-app .rmap-pin-left .rmap-label { right: 52px; align-items: flex-end; text-align: right; }
.servhub-app .rmap-pin-right .rmap-label { left: 52px; align-items: flex-start; text-align: left; }
.servhub-app .rmap-pin:hover .rmap-label { border-color: var(--ds-color-primary-200); transform: translateY(-4px); }
.servhub-app .rmap-name { font-size: 24px; font-weight: 700; color: var(--ds-color-text-primary); }
.servhub-app .rmap-hint { font-size: 13px; color: var(--ds-color-text-secondary); }
.servhub-app .rmap-hint b { color: var(--ds-color-primary-700); }
.servhub-app .rmap-go { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 8px 16px; border-radius: 999px; font-size: 13.5px; font-weight: 700;
  color: #fff; background: var(--ds-color-primary); box-shadow: var(--ds-shadow-button); }
.servhub-app .rmap-go svg { transition: transform .2s; }
.servhub-app .rmap-pin:hover .rmap-go svg { transform: translateX(3px); }

.servhub-app .rl-phone { display: none; }
@media (max-width: 900px) {
  .servhub-app .rmap { display: none; }
  .servhub-app .rl-phone { display: block; position: relative; width: 100%; }
  .servhub-app .rmap-stage { padding: 16px; }
}
.servhub-app.dark .rl-line b { color: var(--ds-color-primary-300); }
````

### `src/styles/service-card.css`

````css
/* Services / Packages card — icon header, labelled 2-column fields, price band. */

.servhub-app .svc-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.servhub-app .svc-card:hover { border-color: var(--ds-color-primary-300); box-shadow: 0 14px 30px rgba(2, 54, 53, .12); }

.servhub-app .svc-head { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 10px; background: linear-gradient(180deg, var(--ds-color-surface-selected) 0%, rgba(255, 255, 255, 0) 100%); }
.servhub-app.dark .svc-head { background: linear-gradient(180deg, rgba(64, 255, 184, .07) 0%, transparent 100%); }
.servhub-app .svc-icon { flex: none; width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: radial-gradient(40px 30px at 30% 20%, rgba(64, 255, 184, .45), transparent 70%), linear-gradient(135deg, #1a8a73 0%, #0d594b 100%); box-shadow: var(--ds-shadow-button); }
.servhub-app .svc-head-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.servhub-app .svc-kind { font-size: 11.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ds-color-primary); }
.servhub-app .svc-title { font: 700 16px/1.35 var(--ds-font-family); color: var(--text-primary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.servhub-app .svc-ar { padding: 0 18px; font-size: 15px; font-weight: 600; color: var(--ds-color-primary-700); text-align: right; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.servhub-app.dark .svc-ar { color: #7ce8c1; }

.servhub-app .svc-grid { margin: 12px 18px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.servhub-app .svc-f { min-width: 0; padding: 8px 10px; border-radius: 10px; background: var(--ds-color-surface-muted); border: 1px solid var(--border); }
.servhub-app .svc-f.wide { grid-column: span 2; }
.servhub-app .svc-f dt { font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--text-body); margin-bottom: 3px; }
.servhub-app .svc-f dd { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere; }
.servhub-app .svc-f .card-code { padding: 2px 0; border: none; background: none; box-shadow: none; font: 700 14.5px var(--ds-font-family); color: var(--ds-color-primary-700); gap: 8px; }
.servhub-app .svc-f .card-code svg { opacity: .7; }
.servhub-app .svc-f .card-code:hover { color: var(--ds-color-primary); box-shadow: none; }
.servhub-app .svc-f .card-code.copied { color: var(--ds-status-success-text); background: none; }
.servhub-app.dark .svc-f .card-code { color: #7ce8c1; }

.servhub-app .svc-price { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-top: 1px solid var(--ds-color-primary-line); background: linear-gradient(90deg, rgba(18, 110, 92, .07) 0%, rgba(64, 255, 184, .12) 100%); }
.servhub-app .svc-price-label { font-size: 12px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ds-color-primary); }
.servhub-app .svc-price-amount { font: 800 24px/1 var(--ds-font-family); color: var(--ds-color-primary-700); white-space: nowrap; }
.servhub-app .svc-price-amount small { font-size: 13px; font-weight: 700; color: var(--ds-color-primary); }
.servhub-app .svc-price-amount.na { font-size: 16px; color: var(--muted); }
.servhub-app.dark .svc-price-amount { color: #7ce8c1; }
````

### `src/styles/doctor-card-styles.css`

````css
/* Doctor card — "Split" design (chosen by the user 2026-09-29): photo + names block, labelled
   fields, consultation-fee table, full-width "Visit Doctor Profile" button (as in Classic).
   The names block is side by side on wide cards and on top on narrow ones. */

.servhub-app .dcx-card { overflow: visible; }
.servhub-app .dcx-card:hover, .servhub-app .dcx-card:focus-within { z-index: 5; }

.servhub-app .spl-card { padding: 0; container-type: inline-size; }
.servhub-app .spl-card-inner { display: grid; grid-template-columns: 160px 1fr; height: 100%; }
@container (max-width: 440px) {
  .servhub-app .spl-card-inner { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
}

/* ---- Names block ---- */
/* Radius follows the card (minus its 1px border) so the white block never pokes past a corner. */
.servhub-app .spl-side { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 2px; padding: 20px 14px 16px; border-radius: calc(var(--ds-radius-card, 16px) - 1px) 0 0 calc(var(--ds-radius-card, 16px) - 1px); }
@container (max-width: 440px) {
  .servhub-app .spl-side { border-radius: calc(var(--ds-radius-card, 16px) - 1px) calc(var(--ds-radius-card, 16px) - 1px) 0 0; border-right: none !important; }
}
.servhub-app .spl-side .hub-doctor-photo { width: 88px; height: 88px; margin-bottom: 10px; }
.servhub-app .dcx-name { font: 700 16px/1.3 var(--ds-font-family); color: var(--text-primary); }
.servhub-app .dcx-user { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.servhub-app .dcx-ar { font-size: 15px; font-weight: 600; color: var(--ds-color-primary-700); }
.servhub-app.dark .dcx-ar { color: #7ce8c1; }
.servhub-app .spl-side .hub-flag { position: relative; top: auto; right: auto; align-self: center; margin-top: 8px; padding: 2px 9px; border-radius: 999px; background: var(--ds-status-urgent-bg); font-size: 12px; z-index: 3; }
.servhub-app .spl-side .hub-flag-tip { left: 50%; right: auto; transform: translateX(-50%); }

/* Names block: white with a teal photo ring and a divider (user choice "White", 2026-09-29). */
.servhub-app .spl-side { background: var(--ds-color-surface-raised); border-right: 1px solid var(--border); }
.servhub-app .spl-side .hub-doctor-photo { border: 3px solid var(--ds-color-surface-raised); box-shadow: 0 0 0 2.5px var(--ds-color-primary), 0 6px 14px rgba(2, 54, 53, .12); }
@container (max-width: 440px) { .servhub-app .spl-side { border-bottom: 1px solid var(--border); } }

/* ---- Details ---- */
.servhub-app .spl-main { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 16px; min-width: 0; }
.servhub-app .spl-main .dcx-action { margin-top: auto; gap: 8px; }

.servhub-app .dcx-fee-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; border: 1px solid var(--ds-color-primary-line); border-radius: 10px; overflow: hidden; }
.servhub-app .dcx-fee-table th { text-align: left; padding: 7px 12px; font-size: 11.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--ds-color-primary); background: var(--ds-color-surface-selected); }
.servhub-app .dcx-fee-table th:last-child, .servhub-app .dcx-fee-table td:last-child { text-align: right; }
.servhub-app .dcx-fee-table td { padding: 8px 12px; border-top: 1px solid var(--border); font-weight: 600; color: var(--text-primary); }
.servhub-app .dcx-fee-table td:last-child { font-weight: 800; color: var(--ds-color-primary-700); white-space: nowrap; }
.servhub-app .dcx-fee-table tr.first td { background: rgba(231, 185, 74, .10); }
.servhub-app.dark .dcx-fee-table td:last-child { color: #7ce8c1; }

.servhub-app .hub-toolbar { flex-wrap: wrap; }

/* Clinic names on doctor cards: links to the clinic's Procedure Clinic hub (legacy). */
.servhub-app .clinic-link { padding: 0; border: none; background: none; color: var(--ds-color-primary); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.servhub-app .clinic-link:hover { color: var(--ds-color-primary-700); }
````

### `src/styles/doctor-profile.css`

````css
/* Doctor profile — "Sidebar" layout (user choice 2026-09-29). */

.servhub-app .pf-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.servhub-app .pf-top .back-link { margin-bottom: 0; }
.servhub-app .pf-top .hub-toolbar { margin-bottom: 0; }

/* Identity: photo + names */
.servhub-app .pf-identity { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.servhub-app .pf-identity .hub-doctor-photo { flex: none; width: 104px; height: 104px; margin: 0; border: 3px solid var(--ds-color-surface-raised); box-shadow: 0 0 0 2.5px var(--ds-color-primary), 0 8px 18px rgba(2, 54, 53, .14); }
.servhub-app .pf-identity-center { flex-direction: column; text-align: center; gap: 12px; }
.servhub-app .pf-names { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.servhub-app .pf-name { font: 700 22px/1.25 var(--ds-font-family); color: var(--text-primary); }
.servhub-app .pf-user { font-size: 14px; color: var(--muted); }
.servhub-app .pf-ar { font-size: 17px; font-weight: 600; color: var(--ds-color-primary-700); }
.servhub-app.dark .pf-ar { color: #7ce8c1; }
.servhub-app .pf-ar { text-align: left; }
.servhub-app .pf-identity-center .pf-ar { text-align: center; }

/* Section titles + text */
.servhub-app .pf-title { font-size: 12.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ds-color-primary); margin: 0 0 10px; }
.servhub-app .pf-section { margin-bottom: 16px; }
.servhub-app .pf-section .hub-text { font-size: 15px; line-height: 1.7; }
.servhub-app .pf-lang { font-size: 12px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--text-body); margin-bottom: 6px; }
.servhub-app .pf-facts { margin: 0; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
.servhub-app .pf-facts .svc-f dd { font-size: 15px; }
.servhub-app .pf-exceptions { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }

/* Sidebar layout */
.servhub-app .pf-sidebar-layout { display: grid; grid-template-columns: minmax(300px, 360px) 1fr; gap: 16px; align-items: start; }
.servhub-app .pf-aside { position: sticky; top: 64px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 0; }
.servhub-app .pf-aside .pf-title { margin: 12px 0 4px; }
.servhub-app .pf-main { min-width: 0; }
@media (max-width: 980px) {
  .servhub-app .pf-sidebar-layout { grid-template-columns: 1fr; }
  .servhub-app .pf-aside { position: static; }
}

/* Rich-text field values (tiles / card fields) */
.servhub-app .rich-value { font-size: inherit; font-weight: inherit; line-height: 1.5; }
.servhub-app .rich-value p { margin: 0; }
.servhub-app .rich-text table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.servhub-app .rich-text td, .servhub-app .rich-text th { border: 1px solid var(--border); padding: 4px 8px; }

/* ---- Consultation fees in the profile, without sideways scrolling: per BU a header, then one
   line per fee type (label left, amount right). ---- */
.servhub-app .fee-list { display: flex; flex-direction: column; gap: 10px; }
.servhub-app .fee-bu { border: 1px solid var(--ds-color-primary-line); border-radius: 12px; overflow: hidden; background: var(--ds-color-surface-raised); }
.servhub-app .fee-bu.first { border-color: var(--ds-color-analytics); }
.servhub-app .fee-bu-name { font-weight: 700; color: var(--ds-color-primary-700); }
.servhub-app .fee-label { font-size: 11.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); }
.servhub-app .fee-amount { font-weight: 600; color: var(--text-primary); white-space: nowrap; }
.servhub-app .fee-value.main .fee-amount { color: var(--ds-color-primary); font-weight: 700; }
.servhub-app .fee-bu-name { padding: 8px 12px; background: var(--ds-color-surface-selected); border-bottom: 1px solid var(--ds-color-primary-line); }
.servhub-app .fee-bu.first .fee-bu-name { background: var(--ds-color-analytics-soft); }
.servhub-app .fee-values { padding: 4px 12px; }
.servhub-app .fee-value { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--border); }
.servhub-app .fee-value:last-child { border-bottom: none; }
````


---

# Part 3. Project setup files

## Config and entry

Install the same packages (`npm install`); `@microsoft/power-apps` and the `pa` CLI come from `pa init`.

### `package.json`

````json
{
  "name": "servicehub",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "labels": "node scripts/build-column-labels.mjs"
  },
  "dependencies": {
    "@fontsource/jetbrains-mono": "^5.3.0",
    "@fontsource/urbanist": "^5.3.0",
    "@microsoft/power-apps": "^1.2.5",
    "@tiptap/core": "^3.31.3",
    "@tiptap/extension-table": "^3.31.3",
    "@tiptap/extension-text-align": "^3.31.3",
    "@tiptap/extension-text-style": "^3.31.3",
    "@tiptap/pm": "^3.31.3",
    "@tiptap/react": "^3.31.3",
    "@tiptap/starter-kit": "^3.31.3",
    "dompurify": "^3.4.16",
    "iconsax-react": "^0.0.8",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "write-excel-file": "^4.1.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@microsoft/power-apps-cli": "0.15.2",
    "@microsoft/power-apps-vite": "^1.0.2",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.4",
    "vite": "^7.2.4"
  }
}
````

### `vite.config.ts`

````ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), powerApps()],
  // Fixed port so the Local Play link (…_localAppUrl=http://localhost:5182/) never changes.
  server: { port: 5182, strictPort: true },
  resolve: {
    alias: {
      // write-excel-file's public entry zips with fflate's async `zip`, which runs on Web Workers;
      // the code app's CSP blocks workers (worker-src 'none'), so the export never finished. This
      // module also exports `generateXlsxFileSync` (zipSync, no worker), which the package's exports
      // map doesn't expose. Declared in src/env.d.ts; used by src/data/exportExcel.ts.
      "write-excel-file-sync": fileURLToPath(new URL("./node_modules/write-excel-file/modules/export/writeXlsxFileUniversal.js", import.meta.url)),
    },
  },
});
````

### `tsconfig.json`

````json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
````

### `tsconfig.app.json`

````json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src"]
}
````

### `tsconfig.node.json`

````json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
````

### `eslint.config.js`

````js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // src/generated is produced by `pa` and overwritten on regenerate; never lint or hand-edit it.
  globalIgnores(['dist', 'src/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
])
````

### `index.html`

````html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="data:," />
    <title>ServiceHub</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
````

### `src/main.tsx`

````tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts bundled locally: Urbanist (Synapse design system) + JetBrains Mono for codes.
import '@fontsource/urbanist/400.css'
import '@fontsource/urbanist/500.css'
import '@fontsource/urbanist/600.css'
import '@fontsource/urbanist/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/synapse.css'
import './styles/hub-cards.css'
import './styles/service-card.css'
import './styles/doctor-card-styles.css'
import './styles/doctor-profile.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
````

### `src/App.tsx`

````tsx
import { AppShell } from './app/AppShell';
import { PermissionsProvider } from './app/PermissionsProvider';
import { RegionProvider } from './app/RegionProvider';

export default function App() {
  return (
    <RegionProvider>
      <PermissionsProvider>
        <AppShell />
      </PermissionsProvider>
    </RegionProvider>
  );
}
````

### `src/env.d.ts`

````ts
/** Optional overrides of the data org (src/data/config.ts), set in .env.development.local for Local Play only. */
/**
 * write-excel-file's universal module, aliased in vite.config.ts for its worker-free generator
 * (`zipSync`). Same arguments as the package's default export, plus the content converter.
 */
declare module 'write-excel-file-sync' {
  export function generateXlsxFileSync(data: unknown, options: unknown, unused: undefined, convertFileContent: (content: Blob) => Promise<Uint8Array>): Promise<Blob>;
}

interface ImportMetaEnv {
  readonly VITE_DATA_ORG_URL?: string;
  readonly VITE_MDA_APP_ID?: string;
}
````


---

# Part 4. Reusable source

## Engine (data layer, grid, form, shell)

Generic: works for any Dataverse table that the MDA app exposes. It reads the MDA sitemap, views, forms, lookups and privileges live.

### `src/data/config.ts`

````ts
/**
 * Dataverse organization that holds the ServiceHub tables. The code app itself is hosted in a
 * different environment (see power.config.json), so every read goes through the generic
 * Dataverse connector's `*WithOrganization` operations with this URL.
 *
 * Live (production) org since 2026-10-01; the dev org "DT New" is https://org319b4ea9.crm4.dynamics.com
 * (MDA appid 0ac620f5-a688-f011-b4cc-6045bdf37b46). `npm run dev` (Local Play) can point at another
 * org through .env.development.local (VITE_DATA_ORG_URL / VITE_MDA_APP_ID); production builds don't
 * read that file, so the published app keeps these values.
 */
export const DATA_ORG_URL = import.meta.env.VITE_DATA_ORG_URL || 'https://org2f45e702.crm4.dynamics.com';

/**
 * The model-driven app whose table experience ServiceHub mirrors (its `appid`). Table pages show
 * the views that app includes, like the model-driven app does. Changes with the data org.
 */
export const MDA_APP_ID = import.meta.env.VITE_MDA_APP_ID || 'b40cd966-2e2d-444c-9fb7-9ba067e1f335';
````

### `src/data/dataverse.ts`

````ts
import { MicrosoftDataverseService } from '../generated';
import { DATA_ORG_URL } from './config';

/** One Dataverse row as returned by the Web API (values plus OData annotations). */
export type DataverseRow = Record<string, unknown>;

export interface ListRequest {
  entitySet: string;
  select?: string;
  filter?: string;
  orderBy?: string;
  top?: number;
  fetchXml?: string;
}

export interface ListResult {
  rows: DataverseRow[];
  /** From `@Microsoft.Dynamics.CRM.morerecords` (FetchXML paging); null when not reported. */
  moreRecords: boolean | null;
  /** From `@Microsoft.Dynamics.CRM.totalrecordcount` (FetchXML `returntotalrecordcount`); capped at 5000 by Dataverse. */
  totalCount: number | null;
}

/** Calls to the data org. Swappable so the dev preview can run without Dataverse. */
export interface DataverseGateway {
  list: (request: ListRequest) => Promise<Record<string, unknown>>;
  /** Returns the created row when the service sends it back (return=representation). */
  create: (entitySet: string, item: DataverseRow) => Promise<DataverseRow | undefined>;
  update: (entitySet: string, id: string, item: DataverseRow) => Promise<void>;
  remove: (entitySet: string, id: string) => Promise<void>;
  /** Unbound Dataverse action, e.g. GrantAccess (Share). */
  action: (name: string, body: DataverseRow) => Promise<DataverseRow>;
}

// Only what the grid uses: formatted values (lookup names, choice labels, dates) and the
// paging/count annotations. "*" also returned lookup navigation metadata on every lookup value.
const PREFER = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue,Microsoft.Dynamics.CRM.*"';
const ACCEPT = 'application/json';

function unwrap<T>(result: { error?: unknown; data: T }): T {
  if (result.error) throw result.error instanceof Error ? result.error : new Error(String(result.error));
  return result.data;
}

const connectorGateway: DataverseGateway = {
  list: async (request) =>
    unwrap(
      await MicrosoftDataverseService.ListRecordsWithOrganization(
        DATA_ORG_URL,
        request.entitySet,
        PREFER,
        undefined,
        undefined,
        undefined,
        request.select,
        request.filter,
        request.orderBy,
        undefined,
        request.fetchXml,
        request.top,
      ),
    ) ?? {},
  create: async (entitySet, item) => {
    const created: unknown = unwrap(await MicrosoftDataverseService.CreateRecordWithOrganization('return=representation', ACCEPT, DATA_ORG_URL, entitySet, item));
    return created && typeof created === 'object' ? (created as DataverseRow) : undefined;
  },
  update: async (entitySet, id, item) => {
    unwrap(await MicrosoftDataverseService.UpdateRecordWithOrganization('return=minimal', ACCEPT, DATA_ORG_URL, entitySet, id, item));
  },
  remove: async (entitySet, id) => {
    unwrap(await MicrosoftDataverseService.DeleteRecordWithOrganization(DATA_ORG_URL, entitySet, id));
  },
  action: async (name, body) => unwrap(await MicrosoftDataverseService.PerformUnboundActionWithOrganization(DATA_ORG_URL, name, body)) ?? {},
};

let gateway: DataverseGateway = connectorGateway;

/** Dev preview only: replace the connector with canned data. */
export function setPreviewGateway(preview: DataverseGateway): void {
  gateway = preview;
}

/** True when the dev preview replaced the connector (connector-only calls are skipped then). */
export const isPreviewGateway = () => gateway !== connectorGateway;

export async function listRows(request: ListRequest): Promise<ListResult> {
  const started = performance.now();
  const data = await gateway.list(request);
  if (import.meta.env.DEV) {
    // Timing of every data-org call, to see where load time goes (Local Play / npm run dev only).
    const count = Array.isArray(data.value) ? data.value.length : 0;
    console.info(`[dataverse] ${request.entitySet}${request.fetchXml ? ' (view)' : ''}: ${Math.round(performance.now() - started)} ms, ${count} rows`);
  }
  const value = data.value;
  const more = data['@Microsoft.Dynamics.CRM.morerecords'];
  const total = data['@Microsoft.Dynamics.CRM.totalrecordcount'];
  return {
    rows: Array.isArray(value) ? (value as DataverseRow[]) : [],
    moreRecords: typeof more === 'boolean' ? more : null,
    totalCount: typeof total === 'number' && total >= 0 ? total : null,
  };
}

export const createRow = (entitySet: string, item: DataverseRow) => gateway.create(entitySet, item);
export const updateRow = (entitySet: string, id: string, item: DataverseRow) => gateway.update(entitySet, id, item);
export const deleteRow = (entitySet: string, id: string) => gateway.remove(entitySet, id);

export const runAction = (name: string, body: DataverseRow) => gateway.action(name, body);

/** Activate / Deactivate: setting statecode lets Dataverse apply that state's default status reason. */
export const setRowState = (entitySet: string, id: string, active: boolean) =>
  gateway.update(entitySet, id, { statecode: active ? 0 : 1 });

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : 'Unexpected error';
}
````

### `src/data/useAsyncData.ts`

````ts
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './dataverse';

export interface AsyncData<T> {
  loading: boolean;
  data: T | undefined;
  error: string | undefined;
}

/**
 * Loads data whenever `key` changes (null = don't load). Results are stored with the key they
 * belong to, so "loading" is derived during render instead of reset with setState in an effect,
 * and a slow earlier response can never overwrite a newer one.
 */
export function useAsyncData<T>(key: string | null, loader: () => Promise<T>): AsyncData<T> {
  const [result, setResult] = useState<{ key: string; data?: T; error?: string } | null>(null);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (key === null) return undefined;
    let cancelled = false;
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key, data });
      },
      (error: unknown) => {
        if (!cancelled) setResult({ key, error: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = result && result.key === key ? result : null;
  return { loading: key !== null && current === null, data: current?.data, error: current?.error };
}
````

### `src/data/columnMeta.ts`

````ts
import { MicrosoftDataverseService } from '../generated';
import { COLUMN_META, type ColumnKind, type RawColumnMeta } from './columnLabels.generated';
import { DATA_ORG_URL } from './config';
import { isPreviewGateway, listRows } from './dataverse';

export type { ColumnKind };

export interface ChoiceOption {
  value: number;
  label: string;
}

/** Column metadata from the Dataverse schema, in readable form. */
export interface ColumnMeta {
  name: string;
  label: string;
  kind: ColumnKind;
  /** Choice / two-option / status values with their labels. */
  options: ChoiceOption[];
  multiSelect: boolean;
  twoOption: boolean;
  required: boolean;
  readOnly: boolean;
  maxLength?: number;
  /** Lookup navigation property used for `@odata.bind` when saving. */
  navigationProperty?: string;
}

// ---- Live metadata ----
// The build ships a snapshot (columnLabels.generated.ts, from reference/dataverse-schemas). Like the
// model-driven app, a table's columns are also read live from Dataverse when the table opens, so
// columns added later (e.g. a new lookup) work without rebuilding. The snapshot stays the source
// for the columns it knows, and the fallback when the live read fails.

type SchemaProperty = Record<string, unknown>;

const live = new Map<string, Record<string, RawColumnMeta>>();
const liveLoads = new Map<string, Promise<void>>();
/** A slow or unanswered metadata call must not hold the page: the snapshot is used after this. */
const LIVE_META_TIMEOUT_MS = 6000;

/** What the live read did per table (shown in development to diagnose it). */
export const liveMetaStatus = new Map<string, string>();

type MutableRawMeta = { -readonly [key in keyof RawColumnMeta]: RawColumnMeta[key] };

const ATTRIBUTE_KIND: Record<string, ColumnKind> = {
  Lookup: 'lookup',
  Owner: 'lookup',
  Customer: 'lookup',
  Picklist: 'choice',
  State: 'choice',
  Status: 'choice',
  Boolean: 'choice',
  DateTime: 'date',
  Memo: 'memo',
  Integer: 'number',
  BigInt: 'number',
  Decimal: 'number',
  Double: 'number',
  Money: 'number',
  String: 'text',
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Columns from Dataverse attribute metadata (EntityDefinitions/Attributes): type, label, required,
 * read-only and, for lookups, the schema name used as the @odata.bind navigation property.
 */
async function attributeMetadata(tableLogicalName: string): Promise<Record<string, RawColumnMeta>> {
  const { rows } = await listRows({
    entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes`,
    select: 'LogicalName,AttributeType,SchemaName,DisplayName,RequiredLevel,IsValidForCreate,IsValidForUpdate,AttributeOf',
  });
  const columns: Record<string, RawColumnMeta> = {};
  for (const row of rows) {
    const name = text(row.LogicalName);
    const type = text(row.AttributeType);
    const kind = ATTRIBUTE_KIND[type];
    // AttributeOf: companion columns (lookup name / yomi fields), not shown on their own.
    if (!name || !kind || row.AttributeOf) continue;
    const display = row.DisplayName as { UserLocalizedLabel?: { Label?: string } | null } | undefined;
    const column: MutableRawMeta = { l: display?.UserLocalizedLabel?.Label || name, k: kind };
    if (type === 'Boolean') {
      column.o = [[1, 'Yes'], [0, 'No']];
      column.b = 1;
    }
    const required = (row.RequiredLevel as { Value?: string } | undefined)?.Value;
    if (required === 'ApplicationRequired' || required === 'SystemRequired') column.r = 1;
    if (row.IsValidForCreate === false && row.IsValidForUpdate === false) column.ro = 1;
    if ((type === 'Lookup' || type === 'Customer') && text(row.SchemaName)) column.s = text(row.SchemaName);
    columns[name] = column;
  }
  return columns;
}

/**
 * Fallback when attribute metadata can't be read: the connector's "get a row" schema lists every
 * column by its Web API name with a title, but no Dataverse type. Lookups are recognisable
 * (`_x_value`, "Label (Value)"); other columns get a kind from the JSON type. No navigation
 * property here, so a new lookup found this way shows read-only.
 */
function fromRowSchema(properties: Record<string, SchemaProperty>): Record<string, RawColumnMeta> {
  const columns: Record<string, RawColumnMeta> = {};
  for (const [key, meta] of Object.entries(properties)) {
    if (key.includes('@')) continue;
    const title = text(meta.title);
    const lookup = /^_(.+)_value$/.exec(key);
    if (lookup) {
      columns[lookup[1]] = { l: title.replace(/\s*\(Value\)$/i, '') || lookup[1], k: 'lookup' };
      continue;
    }
    if (key.startsWith('_')) continue;
    const jsonType = text(meta.type);
    const kind: ColumnKind = jsonType === 'integer' || jsonType === 'number' ? 'number' : text(meta.format) === 'date-time' ? 'date' : jsonType === 'boolean' ? 'choice' : 'text';
    columns[key] = jsonType === 'boolean' ? { l: title || key, k: kind, o: [[1, 'Yes'], [0, 'No']], b: 1 } : { l: title || key, k: kind };
  }
  return columns;
}

async function readLiveColumns(tableLogicalName: string, entitySet: string): Promise<{ columns: Record<string, RawColumnMeta>; source: string }> {
  try {
    const columns = await attributeMetadata(tableLogicalName);
    if (Object.keys(columns).length) return { columns, source: 'attribute metadata' };
  } catch (error) {
    liveMetaStatus.set(tableLogicalName, `attribute metadata failed (${error instanceof Error ? error.message : String(error)})`);
  }
  const result = await MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet);
  const properties = result.error ? null : schemaProperties(result.data);
  return { columns: properties ? fromRowSchema(properties) : {}, source: 'row schema' };
}

/** The column properties, wherever the connector puts them (schema.properties or schema.items.properties). */
function schemaProperties(data: unknown): Record<string, SchemaProperty> | null {
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const schema = root?.schema && typeof root.schema === 'object' ? (root.schema as Record<string, unknown>) : root;
  const items = schema?.items && typeof schema.items === 'object' ? (schema.items as Record<string, unknown>) : null;
  const properties = (items?.properties ?? schema?.properties) as Record<string, SchemaProperty> | undefined;
  return properties && typeof properties === 'object' && Object.keys(properties).length ? properties : null;
}

/**
 * Reads the table's current columns from Dataverse (once per session) and adds the ones the shipped
 * snapshot doesn't know (new columns). Columns in the snapshot keep its fuller data (choice options,
 * max lengths). Never rejects; await it before rendering a table's grid or form.
 */
export function loadLiveColumnMeta(tableLogicalName: string, entitySet: string): Promise<void> {
  if (isPreviewGateway()) return Promise.resolve();
  let load = liveLoads.get(tableLogicalName);
  if (!load) {
    const read = readLiveColumns(tableLogicalName, entitySet)
      .then(({ columns, source }) => {
        const snapshot = COLUMN_META[tableLogicalName] ?? {};
        const added = Object.keys(columns).filter((name) => !snapshot[name]);
        live.set(tableLogicalName, { ...Object.fromEntries(added.map((name) => [name, columns[name]])), ...snapshot });
        const previous = liveMetaStatus.get(tableLogicalName);
        const detail = added.map((name) => `${name} (${columns[name].k}${columns[name].s ? `, saves as ${columns[name].s}` : ''})`).join(', ');
        liveMetaStatus.set(tableLogicalName, `${previous ? `${previous}; ` : ''}${source}: ${Object.keys(columns).length} columns, new: ${detail || 'none'}`);
      })
      .catch((error: unknown) => {
        liveMetaStatus.set(tableLogicalName, `failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    load = Promise.race([
      read,
      new Promise<void>((resolve) =>
        window.setTimeout(() => {
          if (!liveMetaStatus.has(tableLogicalName)) liveMetaStatus.set(tableLogicalName, 'timed out, using the snapshot');
          resolve();
        }, LIVE_META_TIMEOUT_MS),
      ),
    ]);
    liveLoads.set(tableLogicalName, load);
  }
  return load;
}

const metaOf = (tableLogicalName: string): Record<string, RawColumnMeta> | undefined => live.get(tableLogicalName) ?? COLUMN_META[tableLogicalName];

const tidy = (label: string) => label.replace(/\s+/g, ' ').trim();

export function columnMeta(tableLogicalName: string, attribute: string): ColumnMeta | undefined {
  const raw = metaOf(tableLogicalName)?.[attribute];
  if (!raw) return undefined;
  return {
    name: attribute,
    label: tidy(raw.l),
    kind: raw.k,
    options: (raw.o ?? []).map(([value, label]) => ({ value, label })),
    multiSelect: raw.m === 1,
    twoOption: raw.b === 1,
    required: raw.r === 1,
    readOnly: raw.ro === 1,
    maxLength: raw.x,
    navigationProperty: raw.s,
  };
}

/** All attribute names the schema knows for a table. */
export function tableAttributes(tableLogicalName: string): string[] {
  return Object.keys(metaOf(tableLogicalName) ?? {});
}
````

### `src/data/columnPrefs.ts`

````ts
/**
 * Per-view grid preferences ("Edit columns", "Column width", "Move left/right"), stored in this
 * browser only — nothing is written back to the Dataverse view. Reset returns to the view's layout.
 */
export interface ColumnPrefs {
  /** Column order/selection; absent = the view's own columns. */
  columns?: string[];
  /** Column widths in px set by the user, keyed by column name. */
  widths?: Record<string, number>;
}

const keyFor = (tableLogicalName: string, viewId: string) => `servicehub.columns.${tableLogicalName}.${viewId}`;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function readColumnPrefs(tableLogicalName: string, viewId: string): ColumnPrefs {
  try {
    const stored = window.localStorage.getItem(keyFor(tableLogicalName, viewId));
    const parsed: unknown = stored ? JSON.parse(stored) : null;
    // Earlier versions stored just the column list.
    if (isStringArray(parsed)) return { columns: parsed };
    if (!parsed || typeof parsed !== 'object') return {};
    const record = parsed as Record<string, unknown>;
    const widths: Record<string, number> = {};
    if (record.widths && typeof record.widths === 'object') {
      for (const [name, width] of Object.entries(record.widths as Record<string, unknown>)) {
        if (typeof width === 'number' && width > 0) widths[name] = width;
      }
    }
    return {
      columns: isStringArray(record.columns) ? record.columns : undefined,
      widths: Object.keys(widths).length ? widths : undefined,
    };
  } catch {
    return {};
  }
}

export function writeColumnPrefs(tableLogicalName: string, viewId: string, prefs: ColumnPrefs): void {
  try {
    if (!prefs.columns && !prefs.widths) window.localStorage.removeItem(keyFor(tableLogicalName, viewId));
    else window.localStorage.setItem(keyFor(tableLogicalName, viewId), JSON.stringify(prefs));
  } catch {
    // Storage blocked in the host: the choice still applies for this session.
  }
}
````

### `src/data/richTextColumns.ts`

````ts
import { listRows } from './dataverse';

/**
 * Multi-line text columns whose column format is "Rich text" (MemoAttributeMetadata.FormatName =
 * RichText). The model-driven form shows the rich text editor for these even when the form XML
 * doesn't bind the RichTextEditorControl, so the form alone isn't enough to recognise them.
 * The saved schemas don't carry the format, so it is read from table metadata at runtime.
 * Resolves to an empty set when metadata can't be read (form XML / HTML detection still apply).
 */

const cache = new Map<string, Promise<Set<string>>>();

export function loadRichTextColumns(tableLogicalName: string): Promise<Set<string>> {
  let cached = cache.get(tableLogicalName);
  if (!cached) {
    cached = listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes/Microsoft.Dynamics.CRM.MemoAttributeMetadata`,
      select: 'LogicalName,FormatName',
    })
      .then(({ rows }) => {
        const names = rows
          .filter((row) => {
            const format = row.FormatName as { Value?: unknown } | string | undefined;
            const value = typeof format === 'string' ? format : format?.Value;
            return typeof value === 'string' && value.toLowerCase() === 'richtext';
          })
          .map((row) => String(row.LogicalName ?? ''))
          .filter(Boolean);
        if (import.meta.env.DEV) console.info(`[dataverse] rich text columns of ${tableLogicalName}:`, names);
        return new Set(names);
      })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) console.warn(`[dataverse] couldn't read column formats of ${tableLogicalName}`, error);
        return new Set<string>();
      });
    cache.set(tableLogicalName, cached);
  }
  return cached;
}
````

### `src/data/views.ts`

````ts
import type { TableRef } from '../app/navigation';
import type { Region } from '../app/region';
import { columnMeta, loadLiveColumnMeta, tableAttributes, type ColumnKind } from './columnMeta';
import { listRows, type DataverseRow } from './dataverse';
import { MDA_APP_ID } from './config';

/**
 * System views (savedquery) are the source of truth for each table's grid: the view's layoutxml
 * gives the columns (order + width) and its fetchxml gives the filters and sort — exactly what
 * the model-driven app shows. Nothing about columns or filters is hard-coded here.
 */

export interface GridColumn {
  /** Attribute name as in the layout; `alias.attribute` for linked-entity columns. */
  name: string;
  label: string;
  kind: ColumnKind;
  width: number;
  /** Column comes from a linked table (`alias.attribute`); sorted and filtered through that link. */
  linked: boolean;
  /** Logical name of the linked table, for a linked column (its metadata: kind, choice options). */
  entity?: string;
}

export interface TableView {
  id: string;
  name: string;
  isDefault: boolean;
  /** Personal view (userquery, "My Views") rather than a system view (savedquery). */
  personal: boolean;
  /** Region this view is meant for, from its name (EGY / KSA), or null for shared views. */
  region: Region | null;
  fetchXml: string;
  layoutXml: string;
  columns: GridColumn[];
}

const DEFAULT_COLUMN_WIDTH = 150;

/** EGY / KSA marker in a view name, e.g. "Active Doctors - EGY" or "KSA Offers". */
export function regionOfViewName(name: string): Region | null {
  if (/(^|[^a-z])(egy|egypt)([^a-z]|$)/i.test(name)) return 'EGY';
  if (/(^|[^a-z])(ksa|saudi)([^a-z]|$)/i.test(name)) return 'KSA';
  return null;
}

const humanize = (attribute: string) =>
  attribute.replace(/^[a-z0-9]+_/, '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

interface LinkedTable {
  /** Linked table logical name. */
  entity: string;
  /** Lookup on the base table the link goes through (the link-entity `to`). */
  via: string | null;
}

/** alias -> linked table, so linked columns get their real labels. */
function linkAliases(fetchDoc: Document | null): Map<string, LinkedTable> {
  const aliases = new Map<string, LinkedTable>();
  if (!fetchDoc) return aliases;
  for (const link of Array.from(fetchDoc.getElementsByTagName('link-entity'))) {
    const alias = link.getAttribute('alias');
    const entity = link.getAttribute('name');
    if (alias && entity) aliases.set(alias, { entity, via: link.getAttribute('to') });
  }
  return aliases;
}

function columnFor(name: string, width: number, tableLogicalName: string, aliases: Map<string, LinkedTable>): GridColumn {
  const dot = name.indexOf('.');
  const linked = dot > 0 ? aliases.get(name.slice(0, dot)) : undefined;
  const attribute = dot > 0 ? name.slice(dot + 1) : name;
  const owner = dot > 0 ? linked?.entity : tableLogicalName;
  const known = owner ? columnMeta(owner, attribute) : undefined;
  let label = known?.label ?? humanize(attribute);
  // Same convention as the model-driven grid: "Arabic Name (Specialty)" for a linked-table column.
  if (linked) {
    const viaLabel = linked.via ? columnMeta(tableLogicalName, linked.via)?.label : undefined;
    label = `${label} (${viaLabel ?? humanize(linked.entity)})`;
  }
  return {
    name,
    label,
    kind: known?.kind ?? 'text',
    width: width > 0 ? width : DEFAULT_COLUMN_WIDTH,
    linked: dot > 0,
    entity: dot > 0 ? linked?.entity : undefined,
  };
}

/** Grid column for an attribute of the table itself (used for columns the user adds). */
export function tableColumn(name: string, tableLogicalName: string): GridColumn {
  return columnFor(name, DEFAULT_COLUMN_WIDTH, tableLogicalName, new Map());
}

// Technical attributes the model-driven "Edit columns" panel does not offer either.
const HIDDEN_ATTRIBUTES = new Set([
  'versionnumber',
  'importsequencenumber',
  'overriddencreatedon',
  'timezoneruleversionnumber',
  'utcconversiontimezonecode',
  'owningteam',
  'owninguser',
  'owningbusinessunit',
]);

/** Every attribute of the table that can be shown as a column, sorted by label. */
export function availableColumns(tableLogicalName: string): GridColumn[] {
  const attributes = tableAttributes(tableLogicalName);
  return attributes
    .filter((name) => !HIDDEN_ATTRIBUTES.has(name) && name !== `${tableLogicalName}id` && !name.endsWith('_base'))
    .map((name) => tableColumn(name, tableLogicalName))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Makes sure the view's FetchXML returns the given base-table attributes, so user-added columns
 * have data. Filters, sort and links of the view are left untouched.
 */
export function withAttributes(fetchXml: string, names: readonly string[]): string {
  const doc = parseXml(fetchXml);
  const entity = doc?.documentElement.getElementsByTagName('entity')[0];
  if (!doc || !entity) return fetchXml;
  const direct = Array.from(entity.children);
  if (direct.some((child) => child.tagName === 'all-attributes')) return fetchXml;
  const present = new Set(direct.filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')));
  let changed = false;
  for (const name of names) {
    if (name.includes('.') || present.has(name)) continue;
    const attribute = doc.createElement('attribute');
    attribute.setAttribute('name', name);
    entity.insertBefore(attribute, entity.firstChild);
    present.add(name);
    changed = true;
  }
  return changed ? new XMLSerializer().serializeToString(doc) : fetchXml;
}

export function parseViewColumns(layoutXml: string, fetchXml: string, tableLogicalName: string): GridColumn[] {
  const layout = parseXml(layoutXml);
  if (!layout) return [];
  const aliases = linkAliases(parseXml(fetchXml));
  return Array.from(layout.getElementsByTagName('cell'))
    .filter((cell) => cell.getAttribute('ishidden') !== '1' && cell.getAttribute('name'))
    .map((cell) => columnFor(cell.getAttribute('name') ?? '', Number(cell.getAttribute('width')), tableLogicalName, aliases));
}

// Views change rarely; cache per table for the session so switching screens is instant.
const viewCache = new Map<string, Promise<TableView[]>>();

function toView(row: DataverseRow, idField: 'savedqueryid' | 'userqueryid', tableLogicalName: string): TableView | null {
  if (typeof row.fetchxml !== 'string' || typeof row.layoutxml !== 'string') return null;
  const name = String(row.name ?? 'View');
  return {
    id: String(row[idField]),
    name,
    isDefault: row.isdefault === true,
    personal: idField === 'userqueryid',
    region: regionOfViewName(name),
    fetchXml: row.fetchxml,
    layoutXml: row.layoutxml,
    columns: parseViewColumns(row.layoutxml, row.fetchxml, tableLogicalName),
  };
}

const VIEW_SELECT = 'name,isdefault,fetchxml,layoutxml';

/**
 * System views the model-driven app includes (app designer), as savedquery ids; null when the app
 * can't be read. When the app lists no view of a table, the model-driven app shows all of them.
 */
let appViews: Promise<Set<string> | null> | null = null;
function loadAppViewIds(): Promise<Set<string> | null> {
  appViews ??= listRows({
    entitySet: 'appmodulecomponents',
    fetchXml: `<fetch><entity name="appmodulecomponent"><attribute name="objectid" /><filter><condition attribute="componenttype" operator="eq" value="26" /></filter><link-entity name="appmodule" from="appmoduleidunique" to="appmoduleidunique"><filter><condition attribute="appmoduleid" operator="eq" value="${MDA_APP_ID}" /></filter></link-entity></entity></fetch>`,
  })
    .then(({ rows }) => new Set(rows.map((row) => String(row.objectid ?? '').toLowerCase()).filter(Boolean)))
    .catch(() => null);
  return appViews;
}
const viewFilter = (tableLogicalName: string) => `returnedtypecode eq '${tableLogicalName}' and querytype eq 0 and statecode eq 0`;

/**
 * System views (savedquery) plus the user's own and shared personal views ("My Views", userquery).
 * Dataverse only returns personal views the user owns or that were shared with them.
 */
export function loadViews(table: TableRef, { refresh = false } = {}): Promise<TableView[]> {
  const cached = viewCache.get(table.logicalName);
  if (cached && !refresh) return cached;
  const system = listRows({ entitySet: 'savedqueries', select: `savedqueryid,${VIEW_SELECT}`, filter: viewFilter(table.logicalName), orderBy: 'name asc' });
  // Columns are built from the table's metadata: read it live first (new columns), see columnMeta.ts.
  const meta = loadLiveColumnMeta(table.logicalName, table.entitySet);
  // Personal views are optional: a failure here must not hide the system views.
  const personal = listRows({ entitySet: 'userqueries', select: `userqueryid,${VIEW_SELECT}`, filter: viewFilter(table.logicalName), orderBy: 'name asc' }).catch(() => null);
  const request = Promise.all([system, personal, loadAppViewIds(), meta]).then(([systemResult, personalResult, inApp]) => {
    // Like the model-driven app: only the system views the app includes, unless it lists none of this table's.
    const idOf = (row: DataverseRow) => String(row.savedqueryid ?? '').toLowerCase();
    const limit = inApp && systemResult.rows.some((row) => inApp.has(idOf(row))) ? inApp : null;
    const systemRows = limit ? systemResult.rows.filter((row) => limit.has(idOf(row))) : systemResult.rows;
    return [
      ...(personalResult?.rows ?? []).map((row) => toView(row, 'userqueryid', table.logicalName)),
      ...systemRows.map((row) => toView(row, 'savedqueryid', table.logicalName)),
    ].filter((view): view is TableView => view !== null);
  });
  viewCache.set(table.logicalName, request);
  request.catch(() => viewCache.delete(table.logicalName));
  return request;
}

/** One system view by id (used by form subgrids); null when it isn't available. */
export async function loadViewById(table: TableRef, viewId: string): Promise<TableView | null> {
  const { rows } = await listRows({ entitySet: 'savedqueries', select: `savedqueryid,${VIEW_SELECT}`, filter: `savedqueryid eq ${viewId}`, top: 1 });
  return rows[0] ? toView(rows[0], 'savedqueryid', table.logicalName) : null;
}

/** Adds `attribute eq value` to the view's root entity (ANDed with the view's own filters). */
export function withCondition(fetchXml: string, attribute: string, value: string): string {
  const doc = parseXml(fetchXml);
  const entity = doc?.documentElement.getElementsByTagName('entity')[0];
  if (!doc || !entity) return fetchXml;
  const filter = doc.createElement('filter');
  filter.setAttribute('type', 'and');
  const condition = doc.createElement('condition');
  condition.setAttribute('attribute', attribute);
  condition.setAttribute('operator', 'eq');
  condition.setAttribute('value', value);
  filter.appendChild(condition);
  entity.appendChild(filter);
  return new XMLSerializer().serializeToString(doc);
}

/** layoutxml for the given columns, keeping the original view's grid/row attributes. */
export function buildLayoutXml(baseLayoutXml: string, tableLogicalName: string, primaryName: string, columns: readonly GridColumn[]): string {
  const doc = parseXml(baseLayoutXml);
  const row = doc?.getElementsByTagName('row')[0];
  if (!doc || !row) {
    const cells = columns.map((column) => `<cell name="${column.name}" width="${column.width}" />`).join('');
    return `<grid name="resultset" jump="${primaryName}" select="1" icon="1" preview="1"><row name="result" id="${tableLogicalName}id">${cells}</row></grid>`;
  }
  Array.from(row.getElementsByTagName('cell')).forEach((cell) => row.removeChild(cell));
  for (const column of columns) {
    const cell = doc.createElement('cell');
    cell.setAttribute('name', column.name);
    cell.setAttribute('width', String(Math.round(column.width)));
    row.appendChild(cell);
  }
  return new XMLSerializer().serializeToString(doc);
}

const quickFindCache = new Map<string, Promise<string[]>>();

/**
 * "Find columns" of the table's Quick Find view (savedquery querytype 4): the conditions inside its
 * <filter isquickfindfields="1">. These are exactly the columns the model-driven search box uses.
 * Empty when the table has no Quick Find view or it can't be read.
 */
export function loadQuickFindColumns(table: TableRef): Promise<string[]> {
  let cached = quickFindCache.get(table.logicalName);
  if (!cached) {
    cached = listRows({
      entitySet: 'savedqueries',
      select: 'savedqueryid,fetchxml,isdefault',
      filter: `returnedtypecode eq '${table.logicalName}' and querytype eq 4 and statecode eq 0`,
    })
      .then(({ rows }) => {
        const view = rows.find((row) => row.isdefault === true) ?? rows[0];
        const doc = typeof view?.fetchxml === 'string' ? parseXml(view.fetchxml) : null;
        if (!doc) return [];
        const findFilter = Array.from(doc.getElementsByTagName('filter')).find((filter) => filter.getAttribute('isquickfindfields') === '1');
        if (!findFilter) return [];
        return Array.from(findFilter.getElementsByTagName('condition'))
          // Only text-style find columns; linked-table conditions (entityname) are left to the model-driven app.
          .filter((condition) => condition.getAttribute('operator') === 'like' && !condition.getAttribute('entityname'))
          .map((condition) => condition.getAttribute('attribute') ?? '')
          .filter(Boolean);
      })
      .catch(() => []);
    quickFindCache.set(table.logicalName, cached);
  }
  return cached;
}

/** Region view first (e.g. "… EGY" when Egypt is selected), then the table's default view, then the first. */
export function pickView(views: readonly TableView[], region: Region | null, userDefaultId?: string | null): TableView | undefined {
  const system = views.filter((view) => !view.personal);
  return (
    (userDefaultId ? views.find((view) => view.id === userDefaultId) : undefined) ??
    (region ? system.find((view) => view.region === region) : undefined) ??
    system.find((view) => view.isDefault) ??
    system[0] ??
    views[0]
  );
}

// "Set as default view" is kept per table in this browser (the model-driven app keeps it per user).
const defaultViewKey = (tableLogicalName: string) => `servicehub.defaultview.${tableLogicalName}`;

export function readDefaultView(tableLogicalName: string): string | null {
  try {
    return window.localStorage.getItem(defaultViewKey(tableLogicalName));
  } catch {
    return null;
  }
}

export function writeDefaultView(tableLogicalName: string, viewId: string | null): void {
  try {
    if (viewId) window.localStorage.setItem(defaultViewKey(tableLogicalName), viewId);
    else window.localStorage.removeItem(defaultViewKey(tableLogicalName));
  } catch {
    // Not persisted when storage is blocked.
  }
}

export interface PagedFetch {
  fetchXml: string;
  /** False when the view uses `top` (Dataverse does not allow top together with paging). */
  pageable: boolean;
}

/** Adds page/count/returntotalrecordcount to the view's own FetchXML, keeping its filters and sort. */
export function pageFetchXml(fetchXml: string, page: number, pageSize: number): PagedFetch {
  const doc = parseXml(fetchXml);
  const fetch = doc?.documentElement;
  if (!doc || !fetch || fetch.tagName !== 'fetch') return { fetchXml, pageable: false };
  if (fetch.hasAttribute('top')) return { fetchXml, pageable: false };
  fetch.setAttribute('page', String(page));
  fetch.setAttribute('count', String(pageSize));
  fetch.setAttribute('returntotalrecordcount', 'true');
  fetch.removeAttribute('paging-cookie');
  return { fetchXml: new XMLSerializer().serializeToString(doc), pageable: true };
}
````

### `src/data/fetchQuery.ts`

````ts
import type { ColumnKind } from './columnMeta';

/**
 * Grid query on top of a view's FetchXML, mirroring the model-driven grid:
 * - "Edit filters": the view's own root filter is parsed into an editable AND/OR tree and written
 *   back (link-entity filters of the view are kept as-is, like the MDA does for related tables).
 * - Column sort ("A to Z" / "Z to A") replaces the view's <order>.
 * - Keyword search adds an OR of "contains" over the grid's text columns.
 */

export interface FilterCondition {
  kind: 'condition';
  id: string;
  attribute: string;
  /** FetchXML operator, e.g. eq, ne, like, null, on-or-after, in, contain-values. */
  operator: string;
  values: string[];
  /** Kept from the view so lookup conditions still show the record name (FetchXML uiname/uitype). */
  uiName?: string;
  uiType?: string;
  /** Record names for several lookup values (FetchXML <value uiname>), same order as values. */
  uiNames?: string[];
}

export interface FilterGroup {
  kind: 'group';
  id: string;
  type: 'and' | 'or';
  items: FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

let nextId = 0;
export const newNodeId = () => `n${(nextId += 1)}`;

export const emptyGroup = (type: 'and' | 'or' = 'and'): FilterGroup => ({ kind: 'group', id: newNodeId(), type, items: [] });

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

const rootEntity = (doc: Document) => doc.documentElement.getElementsByTagName('entity')[0] ?? null;
const directChildren = (element: Element, tag: string) => Array.from(element.children).filter((child) => child.tagName === tag);

function parseFilterElement(filter: Element): FilterGroup {
  const group: FilterGroup = { kind: 'group', id: newNodeId(), type: filter.getAttribute('type') === 'or' ? 'or' : 'and', items: [] };
  for (const child of Array.from(filter.children)) {
    if (child.tagName === 'filter') group.items.push(parseFilterElement(child));
    else if (child.tagName === 'condition') {
      const single = child.getAttribute('value');
      const valueElements = Array.from(child.getElementsByTagName('value'));
      const listed = valueElements.map((value) => value.textContent ?? '');
      const listedNames = valueElements.map((value) => value.getAttribute('uiname') ?? '');
      const operator = child.getAttribute('operator') ?? 'eq';
      // "in" / "not-in" over named records is how the MDA saves a multi-record lookup Equals.
      const namedLookup = valueElements.length > 0 && listedNames.every(Boolean);
      group.items.push({
        kind: 'condition',
        id: newNodeId(),
        attribute: (child.getAttribute('entityname') ? `${child.getAttribute('entityname')}.` : '') + (child.getAttribute('attribute') ?? ''),
        operator: namedLookup && operator === 'in' ? 'eq' : namedLookup && operator === 'not-in' ? 'ne' : operator,
        values: single !== null ? [single] : listed,
        uiName: child.getAttribute('uiname') ?? undefined,
        uiType: child.getAttribute('uitype') ?? valueElements[0]?.getAttribute('uitype') ?? undefined,
        uiNames: namedLookup ? listedNames : undefined,
      });
    }
  }
  return group;
}

/** The view's own root-entity filter as an editable tree (several root filters are ANDed). */
export function parseViewFilter(fetchXml: string): FilterGroup {
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  if (!entity) return emptyGroup();
  const filters = directChildren(entity, 'filter').map(parseFilterElement);
  if (filters.length === 1) return filters[0];
  return { kind: 'group', id: newNodeId(), type: 'and', items: filters };
}

function writeCondition(doc: Document, condition: FilterCondition): Element | null {
  if (!condition.attribute) return null;
  const element = doc.createElement('condition');
  const dot = condition.attribute.indexOf('.');
  if (dot > 0) {
    element.setAttribute('entityname', condition.attribute.slice(0, dot));
    element.setAttribute('attribute', condition.attribute.slice(dot + 1));
  } else element.setAttribute('attribute', condition.attribute);
  const values = condition.values.filter((value) => value !== '');
  // Equals / Does not equal several lookup records is written as in / not-in (as the MDA saves it).
  const severalRecords = (condition.operator === 'eq' || condition.operator === 'ne') && values.length > 1;
  const operator = severalRecords ? (condition.operator === 'eq' ? 'in' : 'not-in') : condition.operator;
  element.setAttribute('operator', operator);
  if (MULTI_VALUE_OPERATORS.has(operator)) {
    values.forEach((value, index) => {
      const valueElement = doc.createElement('value');
      valueElement.textContent = value;
      const name = condition.uiNames?.[index];
      if (name) valueElement.setAttribute('uiname', name);
      if (name && condition.uiType) valueElement.setAttribute('uitype', condition.uiType);
      element.appendChild(valueElement);
    });
    return element;
  }
  if (!NO_VALUE_OPERATORS.has(operator)) {
    if (!values.length) return null; // incomplete row in the editor: ignore it
    element.setAttribute('value', values[0]);
  }
  const uiName = condition.uiName ?? condition.uiNames?.[0];
  if (uiName) element.setAttribute('uiname', uiName);
  if (condition.uiType) element.setAttribute('uitype', condition.uiType);
  return element;
}

function writeGroup(doc: Document, group: FilterGroup): Element | null {
  const element = doc.createElement('filter');
  element.setAttribute('type', group.type);
  for (const item of group.items) {
    const child = item.kind === 'group' ? writeGroup(doc, item) : writeCondition(doc, item);
    if (child) element.appendChild(child);
  }
  return element.children.length ? element : null;
}

export interface GridQuery {
  /** Replacement for the view's root filter; undefined = keep the view's filter. */
  filter?: FilterGroup;
  /** Sort override; undefined = keep the view's sort. */
  sort?: { attribute: string; descending: boolean };
  /** Keyword search: OR of `like` over the table's Quick Find columns (see quickFindPattern). */
  search?: { pattern: string; attributes: string[] };
}

/**
 * Model-driven quick find semantics: "abc" finds values that begin with abc; a leading "*"
 * ("*abc") finds values that contain abc anywhere. LIKE wildcards typed by the user are escaped.
 */
export function quickFindPattern(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const contains = trimmed.startsWith('*');
  const body = (contains ? trimmed.slice(1) : trimmed).replace(/\*+$/, '').replace(/[%_[]/g, '[$&]');
  if (!body) return null;
  return contains ? `%${body}%` : `${body}%`;
}

export function applyGridQuery(fetchXml: string, query: GridQuery): string {
  if (!query.filter && !query.sort && !query.search) return fetchXml;
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  if (!doc || !entity) return fetchXml;

  if (query.filter) {
    directChildren(entity, 'filter').forEach((filter) => entity.removeChild(filter));
    const filter = writeGroup(doc, query.filter);
    if (filter) entity.appendChild(filter);
  }

  if (query.search?.attributes.length) {
    const search = doc.createElement('filter');
    search.setAttribute('type', 'or');
    for (const attribute of query.search.attributes) {
      const condition = doc.createElement('condition');
      condition.setAttribute('attribute', attribute);
      condition.setAttribute('operator', 'like');
      condition.setAttribute('value', query.search.pattern);
      search.appendChild(condition);
    }
    entity.appendChild(search);
  }

  if (query.sort) {
    // One sort at a time: drop the view's orders, on the table and on its links.
    directChildren(entity, 'order').forEach((order) => entity.removeChild(order));
    Array.from(entity.getElementsByTagName('link-entity')).forEach((link) => directChildren(link, 'order').forEach((order) => link.removeChild(order)));
    // A linked-table column (`alias.attribute`) is sorted inside its link-entity.
    const dot = query.sort.attribute.indexOf('.');
    const link = dot > 0 ? Array.from(entity.getElementsByTagName('link-entity')).find((item) => item.getAttribute('alias') === query.sort?.attribute.slice(0, dot)) : undefined;
    const order = doc.createElement('order');
    order.setAttribute('attribute', link ? query.sort.attribute.slice(dot + 1) : query.sort.attribute);
    order.setAttribute('descending', query.sort.descending ? 'true' : 'false');
    (link ?? entity).appendChild(order);
  }
  return new XMLSerializer().serializeToString(doc);
}

/** Current sort of a view's FetchXML (first root <order>), for the column header arrow. */
export function viewSort(fetchXml: string): { attribute: string; descending: boolean } | null {
  const doc = parseXml(fetchXml);
  const entity = doc && rootEntity(doc);
  const order = entity ? directChildren(entity, 'order')[0] : undefined;
  const attribute = order?.getAttribute('attribute');
  if (attribute) return { attribute, descending: order?.getAttribute('descending') === 'true' };
  // A sort on a linked-table column sits inside its link-entity (`alias.attribute`).
  for (const link of entity ? Array.from(entity.getElementsByTagName('link-entity')) : []) {
    const linkOrder = directChildren(link, 'order')[0];
    const linkAttribute = linkOrder?.getAttribute('attribute');
    const alias = link.getAttribute('alias');
    if (linkAttribute && alias) return { attribute: `${alias}.${linkAttribute}`, descending: linkOrder?.getAttribute('descending') === 'true' };
  }
  return null;
}

// ---- Operators offered in the filter editor (labels as in the model-driven "Edit filters") ----

export const NO_VALUE_OPERATORS = new Set([
  'null', 'not-null', 'today', 'yesterday', 'tomorrow', 'this-week', 'last-week', 'next-week',
  'this-month', 'last-month', 'next-month', 'this-year', 'last-year', 'next-year', 'eq-userid', 'ne-userid',
]);

export const MULTI_VALUE_OPERATORS = new Set(['in', 'not-in', 'contain-values', 'not-contain-values']);

export interface OperatorOption {
  value: string;
  label: string;
}

const TEXT_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'like', label: 'Contains' },
  { value: 'not-like', label: 'Does not contain' },
  { value: 'begins-with', label: 'Begins with' },
  { value: 'not-begin-with', label: 'Does not begin with' },
  { value: 'ends-with', label: 'Ends with' },
  { value: 'not-end-with', label: 'Does not end with' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const NUMBER_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'gt', label: 'Is greater than' },
  { value: 'ge', label: 'Is greater than or equal to' },
  { value: 'lt', label: 'Is less than' },
  { value: 'le', label: 'Is less than or equal to' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const DATE_OPERATORS: OperatorOption[] = [
  { value: 'on', label: 'On' },
  { value: 'on-or-after', label: 'On or after' },
  { value: 'on-or-before', label: 'On or before' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this-week', label: 'This week' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-x-days', label: 'Last X days' },
  { value: 'next-x-days', label: 'Next X days' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const CHOICE_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'in', label: 'Equals any of' },
  { value: 'not-in', label: 'Does not equal any of' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

const MULTI_CHOICE_OPERATORS: OperatorOption[] = [
  { value: 'contain-values', label: 'Contains values' },
  { value: 'not-contain-values', label: 'Does not contain values' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

// "Contains" on a lookup matches the referenced record's name (e.g. "BU contains AHJ").
const LOOKUP_OPERATORS: OperatorOption[] = [
  { value: 'eq', label: 'Equals' },
  { value: 'ne', label: 'Does not equal' },
  { value: 'like', label: 'Contains' },
  { value: 'not-like', label: 'Does not contain' },
  { value: 'not-null', label: 'Contains data' },
  { value: 'null', label: 'Does not contain data' },
];

export function operatorsFor(kind: ColumnKind, multiSelect: boolean): OperatorOption[] {
  if (kind === 'choice') return multiSelect ? MULTI_CHOICE_OPERATORS : CHOICE_OPERATORS;
  if (kind === 'number') return NUMBER_OPERATORS;
  if (kind === 'date') return DATE_OPERATORS;
  if (kind === 'lookup') return LOOKUP_OPERATORS;
  return TEXT_OPERATORS;
}

/** "Contains" is stored as like %value%; the editor shows the value without wildcards. */
export const displayValue = (operator: string, value: string) =>
  operator === 'like' || operator === 'not-like' ? value.replace(/^%|%$/g, '') : value;

export const storedValue = (operator: string, value: string) =>
  (operator === 'like' || operator === 'not-like') && value && !value.includes('%') ? `%${value}%` : value;

/** Attributes used anywhere in a filter tree. */
export function filterAttributes(group: FilterGroup | undefined): Set<string> {
  const names = new Set<string>();
  const walk = (node: FilterNode) => {
    if (node.kind === 'condition') names.add(node.attribute);
    else node.items.forEach(walk);
  };
  if (group) walk(group);
  return names;
}

/** The tree without any condition on `attribute` (groups left empty are dropped). */
export function removeAttribute(group: FilterGroup, attribute: string): FilterGroup {
  const items: FilterNode[] = [];
  for (const item of group.items) {
    if (item.kind === 'condition') {
      if (item.attribute !== attribute) items.push(item);
    } else {
      const inner = removeAttribute(item, attribute);
      if (inner.items.length) items.push(inner);
    }
  }
  return { ...group, items };
}
````

### `src/data/lookups.ts`

````ts
import { MicrosoftDataverseService } from '../generated';
import { findTable } from '../app/navigation';
import { columnMeta, loadLiveColumnMeta } from './columnMeta';
import { DATA_ORG_URL } from './config';
import { listRows, type DataverseRow } from './dataverse';
import { loadQuickFindColumns } from './views';

/**
 * Lookup editing needs, for each lookup column: the table it points to, and that table's entity
 * set + primary name column. The saved schemas don't include lookup targets, so:
 *  1. the target is read from `lookuplogicalname` on the record being edited, or else from any
 *     record that has the lookup filled in;
 *  2. the target's entity set / primary name come from ServiceHub's own tables, a few well-known
 *     system tables, or the connector's table metadata.
 */

export interface LookupTable {
  logicalName: string;
  entitySet: string;
  primaryName: string;
}

export interface LookupOption {
  id: string;
  name: string;
  /** Extra columns of the Lookup View, shown under the name. */
  detail?: string;
}

const LOOKUP_TABLE_ANNOTATION = '@Microsoft.Dynamics.CRM.lookuplogicalname';

const SYSTEM_TABLES: Record<string, LookupTable> = {
  businessunit: { logicalName: 'businessunit', entitySet: 'businessunits', primaryName: 'name' },
  systemuser: { logicalName: 'systemuser', entitySet: 'systemusers', primaryName: 'fullname' },
  team: { logicalName: 'team', entitySet: 'teams', primaryName: 'name' },
  account: { logicalName: 'account', entitySet: 'accounts', primaryName: 'name' },
  contact: { logicalName: 'contact', entitySet: 'contacts', primaryName: 'fullname' },
  transactioncurrency: { logicalName: 'transactioncurrency', entitySet: 'transactioncurrencies', primaryName: 'currencyname' },
};

/** Candidate entity-set names for a logical name (Dataverse pluralization). */
function entitySetCandidates(logicalName: string): string[] {
  const candidates = [`${logicalName}s`, `${logicalName}es`];
  if (logicalName.endsWith('y')) candidates.unshift(`${logicalName.slice(0, -1)}ies`);
  return candidates;
}

interface SchemaItems {
  'x-ms-dataverse-entityset'?: string;
  'x-ms-dataverse-primary-name'?: string;
}

async function metadataFor(logicalName: string): Promise<LookupTable | null> {
  // Dataverse table metadata: entity set and primary name column.
  try {
    const { rows } = await listRows({ entitySet: 'EntityDefinitions', select: 'LogicalName,EntitySetName,PrimaryNameAttribute', filter: `LogicalName eq '${logicalName}'` });
    const row = rows[0];
    if (typeof row?.EntitySetName === 'string' && typeof row.PrimaryNameAttribute === 'string' && row.PrimaryNameAttribute) {
      return { logicalName, entitySet: row.EntitySetName, primaryName: row.PrimaryNameAttribute };
    }
  } catch {
    // fall back to the connector's table schema below
  }
  for (const entitySet of entitySetCandidates(logicalName)) {
    try {
      const result = await MicrosoftDataverseService.GetMetadataForGetEntityWithOrganization(DATA_ORG_URL, entitySet);
      // The table annotations sit on schema.items (list shape) or on schema itself (single row).
      const schema = result.data?.schema as (SchemaItems & { items?: SchemaItems }) | undefined;
      const items = schema?.items?.['x-ms-dataverse-primary-name'] ? schema.items : schema;
      if (!result.error && items?.['x-ms-dataverse-primary-name']) {
        return { logicalName, entitySet: items['x-ms-dataverse-entityset'] ?? entitySet, primaryName: items['x-ms-dataverse-primary-name'] };
      }
    } catch {
      // try the next plural form
    }
  }
  return null;
}

const tableCache = new Map<string, Promise<LookupTable | null>>();

export function lookupTableInfo(logicalName: string): Promise<LookupTable | null> {
  const known = findTable(logicalName)?.table ?? SYSTEM_TABLES[logicalName];
  if (known) return Promise.resolve({ logicalName, entitySet: known.entitySet, primaryName: known.primaryName });
  let cached = tableCache.get(logicalName);
  if (!cached) {
    cached = metadataFor(logicalName);
    tableCache.set(logicalName, cached);
  }
  return cached;
}

const targetCache = new Map<string, Promise<string | null>>();

/** The table a lookup points to, from Dataverse relationship metadata (many-to-one); null if unreadable. */
async function relationshipTarget(tableLogicalName: string, attribute: string): Promise<string | null> {
  try {
    const { rows } = await listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/ManyToOneRelationships`,
      select: 'ReferencingAttribute,ReferencedEntity',
      filter: `ReferencingAttribute eq '${attribute}'`,
    });
    const target = rows[0]?.ReferencedEntity;
    if (typeof target === 'string' && target) return target;
  } catch {
    // try the lookup attribute's own targets below
  }
  try {
    const { rows } = await listRows({
      entitySet: `EntityDefinitions(LogicalName='${tableLogicalName}')/Attributes/Microsoft.Dynamics.CRM.LookupAttributeMetadata`,
      select: 'LogicalName,Targets',
      filter: `LogicalName eq '${attribute}'`,
    });
    const targets = rows[0]?.Targets;
    return Array.isArray(targets) && typeof targets[0] === 'string' ? targets[0] : null;
  } catch {
    return null;
  }
}

/** Table a lookup column points to (from the record, or from any record that has it set). */
export function lookupTargetTable(entitySet: string, tableLogicalName: string, attribute: string, record?: DataverseRow): Promise<string | null> {
  const fromRecord = record?.[`_${attribute}_value${LOOKUP_TABLE_ANNOTATION}`];
  if (typeof fromRecord === 'string') return Promise.resolve(fromRecord);
  const key = `${tableLogicalName}.${attribute}`;
  let cached = targetCache.get(key);
  if (!cached) {
    const fetchXml = `<fetch top="1"><entity name="${tableLogicalName}"><attribute name="${attribute}" /><filter><condition attribute="${attribute}" operator="not-null" /></filter></entity></fetch>`;
    cached = listRows({ entitySet, fetchXml })
      .then(({ rows }) => {
        const target = rows[0]?.[`_${attribute}_value${LOOKUP_TABLE_ANNOTATION}`];
        return typeof target === 'string' ? target : null;
      })
      .catch(() => null)
      // No record has it set yet (e.g. a newly added lookup): ask the table's relationship metadata.
      .then((target) => target ?? relationshipTarget(tableLogicalName, attribute));
    targetCache.set(key, cached);
  }
  return cached;
}

interface LookupView {
  /** The view's FetchXML (its filters and sort), or null when the table has no lookup view. */
  fetchXml: string | null;
  /** The view's columns other than the primary name, in view order. */
  columns: string[];
}

const lookupViewCache = new Map<string, Promise<LookupView>>();

/**
 * The target table's Lookup View (savedquery querytype 64, the default one): what the model-driven
 * lookup searches (its filters and sort) and shows (its columns).
 */
function lookupView(target: LookupTable): Promise<LookupView> {
  let cached = lookupViewCache.get(target.logicalName);
  if (!cached) {
    cached = listRows({
      entitySet: 'savedqueries',
      select: 'savedqueryid,isdefault,fetchxml,layoutxml',
      filter: `returnedtypecode eq '${target.logicalName}' and querytype eq 64 and statecode eq 0`,
    })
      .then(({ rows }) => {
        const view = rows.find((row) => row.isdefault === true) ?? rows[0];
        const layout = typeof view?.layoutxml === 'string' ? new DOMParser().parseFromString(view.layoutxml, 'application/xml') : null;
        const columns = Array.from(layout?.getElementsByTagName('cell') ?? [])
          .map((cell) => cell.getAttribute('name') ?? '')
          .filter((name) => name && !name.includes('.') && name !== target.primaryName);
        return { fetchXml: typeof view?.fetchxml === 'string' ? view.fetchxml : null, columns };
      })
      .catch(() => ({ fetchXml: null, columns: [] }));
    lookupViewCache.set(target.logicalName, cached);
  }
  return cached;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';


/**
 * The lookup view's FetchXML limited to the first 15 matches of the text: an OR of "contains"
 * conditions on the searched columns, ANDed with the view's own filters; its sort is kept.
 */
function searchFetchXml(tableLogicalName: string, viewFetchXml: string, columns: readonly string[], searched: readonly string[], text: string): string | null {
  const doc = new DOMParser().parseFromString(viewFetchXml, 'application/xml');
  const fetch = doc.documentElement;
  const entity = fetch?.getElementsByTagName('entity')[0];
  if (!fetch || fetch.tagName !== 'fetch' || !entity || entity.getAttribute('name') !== tableLogicalName) return null;
  fetch.removeAttribute('page');
  fetch.removeAttribute('count');
  fetch.removeAttribute('paging-cookie');
  fetch.setAttribute('top', '15');
  const present = new Set(Array.from(entity.children).filter((child) => child.tagName === 'attribute').map((child) => child.getAttribute('name')));
  for (const name of columns) {
    if (present.has(name)) continue;
    const attribute = doc.createElement('attribute');
    attribute.setAttribute('name', name);
    entity.insertBefore(attribute, entity.firstChild);
  }
  if (text) {
    const filter = doc.createElement('filter');
    filter.setAttribute('type', 'or');
    for (const name of searched) {
      const condition = doc.createElement('condition');
      condition.setAttribute('attribute', name);
      condition.setAttribute('operator', 'like');
      condition.setAttribute('value', `%${text}%`);
      filter.appendChild(condition);
    }
    entity.appendChild(filter);
  }
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Records of the lookup's table matching the text (top 15), like the model-driven lookup: through
 * the table's Lookup View (its filters and sort), searched on the name and the view's text columns.
 * Each result shows the primary name with the view's next two columns under it, as the model-driven
 * lookup does.
 */
export async function searchLookup(target: LookupTable, text: string): Promise<LookupOption[]> {
  const id = `${target.logicalName}id`;
  const query = text.trim();
  const [view] = await Promise.all([lookupView(target), loadLiveColumnMeta(target.logicalName, target.entitySet)]);
  const kindOf = (column: string) => columnMeta(target.logicalName, column)?.kind;
  // As the model-driven lookup: under the name, the lookup view's next two columns, in view order.
  const details = view.columns.filter((column) => kindOf(column) !== undefined).slice(0, 2);
  const texts = view.columns.filter((column) => kindOf(column) === 'text');
  // Searched like the model-driven lookup: the table's Quick Find columns (text ones), else the view's.
  const quickFind = (await loadQuickFindColumns(target)).filter((column) => kindOf(column) === 'text' || kindOf(column) === 'memo');
  const searched = [...new Set([target.primaryName, ...(quickFind.length ? quickFind : texts)])];

  const fetchXml = view.fetchXml ? searchFetchXml(target.logicalName, view.fetchXml, [id, target.primaryName, ...details], searched, query) : null;
  const { rows } = fetchXml
    ? await listRows({ entitySet: target.entitySet, fetchXml })
    : await listRows({
        entitySet: target.entitySet,
        select: [id, target.primaryName, ...details.map((column) => (kindOf(column) === 'lookup' ? `_${column}_value` : column))].join(','),
        filter: query ? searched.map((column) => `contains(${column},'${query.replace(/'/g, "''")}')`).join(' or ') : undefined,
        orderBy: `${target.primaryName} asc`,
        top: 15,
      });

  const shown = (row: DataverseRow, column: string) => {
    const value = row[`${column}${FORMATTED}`] ?? row[column];
    return value === null || value === undefined ? '' : String(value).trim();
  };
  return rows
    .map((row) => {
      const name = shown(row, target.primaryName);
      // Only values with a letter or digit identify a record; a flag such as ❌ / ✔ alone is left out.
      const extra = details.map((column) => shown(row, kindOf(column) === 'lookup' ? `_${column}_value` : column)).filter(Boolean);
      return { id: String(row[id] ?? ''), name: name || '(No name)', detail: extra.join(' · ') || undefined };
    })
    .filter((option) => option.id);
}
````

### `src/data/forms.ts`

````ts
import { columnMeta, tableAttributes, type ColumnKind } from './columnMeta';
import { listRows } from './dataverse';
import { loadRichTextColumns } from './richTextColumns';

/**
 * Record layout from the table's own main form (systemform, type 2) — the same tabs, sections,
 * field order, labels and subgrids users see in the model-driven app. Falls back to every known
 * column when a table has no active main form.
 */

export interface FormField {
  name: string;
  label: string;
  kind: ColumnKind;
  /** The form uses the rich text editor control for this field (formatted HTML content). */
  richText: boolean;
}

/** Related-records grid placed on the form (e.g. a doctor's fees). */
export interface FormSubgrid {
  id: string;
  label: string;
  /** Logical name of the related table. */
  targetTable: string;
  /** Relationship schema name from the form, used to find the lookup that points back here. */
  relationship: string | null;
  /** View the subgrid shows (savedquery id), or null for the related table's default view. */
  viewId: string | null;
}

export interface FormSection {
  label: string;
  fields: FormField[];
  subgrids: FormSubgrid[];
}

export interface FormTab {
  label: string;
  sections: FormSection[];
}

export interface RecordForm {
  name: string;
  tabs: FormTab[];
}

export const formFields = (form: RecordForm): FormField[] =>
  form.tabs.flatMap((tab) => tab.sections.flatMap((section) => section.fields));

const ENGLISH = '1033';
const SUBGRID_CLASS_IDS = new Set(['{e7a81278-8635-4d9e-8d4d-59480b391c5b}', '{e7a81278-8635-4d9e-8d4d-59480b391c5c}']);

/** The element's own <labels> (not a nested control's). */
function labelOf(element: Element): string | null {
  const own = Array.from(element.children).find((child) => child.tagName === 'labels');
  const labels = Array.from(own?.getElementsByTagName('label') ?? []);
  const label = labels.find((item) => item.getAttribute('languagecode') === ENGLISH) ?? labels[0];
  const text = label?.getAttribute('description')?.trim();
  return text || null;
}

const fieldFor = (name: string, tableLogicalName: string, formLabel: string | null, richText = false): FormField => {
  const known = columnMeta(tableLogicalName, name);
  return { name, label: formLabel ?? known?.label ?? name, kind: known?.kind ?? 'text', richText };
};

/**
 * Controls rendered with the rich text editor. The form binds them through
 * <controlDescription forControl="{control uniqueid}"> whose custom control is RichTextEditorControl.
 */
function richTextControlIds(doc: Document): Set<string> {
  const ids = new Set<string>();
  for (const description of Array.from(doc.getElementsByTagName('controlDescription'))) {
    const usesRichText = Array.from(description.getElementsByTagName('customControl')).some((control) => /RichTextEditor/i.test(control.getAttribute('name') ?? ''));
    const target = description.getAttribute('forControl');
    if (usesRichText && target) ids.add(target.toLowerCase());
  }
  return ids;
}

const parameter = (control: Element, name: string) => control.getElementsByTagName(name)[0]?.textContent?.trim() || null;

function subgridFor(cell: Element, control: Element): FormSubgrid | null {
  const classId = control.getAttribute('classid')?.toLowerCase() ?? '';
  const targetTable = parameter(control, 'TargetEntityType');
  if (!targetTable || (!SUBGRID_CLASS_IDS.has(classId) && !control.getElementsByTagName('RelationshipName').length)) return null;
  const viewId = parameter(control, 'ViewId')?.replace(/[{}]/g, '').toLowerCase() ?? null;
  return {
    id: control.getAttribute('id') ?? targetTable,
    label: labelOf(cell) ?? targetTable,
    targetTable,
    relationship: parameter(control, 'RelationshipName'),
    viewId,
  };
}

export function parseFormXml(formXml: string, tableLogicalName: string): FormTab[] {
  const doc = new DOMParser().parseFromString(formXml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const tabs: FormTab[] = [];
  const seen = new Set<string>();
  const richText = richTextControlIds(doc);
  for (const tab of Array.from(doc.getElementsByTagName('tab'))) {
    if (tab.getAttribute('visible') === 'false') continue;
    const tabLabel = labelOf(tab) ?? 'General';
    const sections: FormSection[] = [];
    for (const section of Array.from(tab.getElementsByTagName('section'))) {
      if (section.getAttribute('visible') === 'false') continue;
      const fields: FormField[] = [];
      const subgrids: FormSubgrid[] = [];
      for (const cell of Array.from(section.getElementsByTagName('cell'))) {
        if (cell.getAttribute('visible') === 'false') continue;
        const control = cell.getElementsByTagName('control')[0];
        if (!control) continue;
        const name = control.getAttribute('datafieldname');
        if (name) {
          // Each field is shown once, even if the form repeats it (e.g. in the header).
          if (seen.has(name)) continue;
          seen.add(name);
          const uniqueId = control.getAttribute('uniqueid')?.toLowerCase() ?? '';
          fields.push(fieldFor(name, tableLogicalName, labelOf(cell), richText.has(uniqueId)));
          continue;
        }
        const subgrid = subgridFor(cell, control);
        if (subgrid) subgrids.push(subgrid);
        // Web resources, spacers, timelines and other controls without data are skipped.
      }
      if (fields.length || subgrids.length) sections.push({ label: labelOf(section) ?? tabLabel, fields, subgrids });
    }
    if (sections.length) tabs.push({ label: tabLabel, sections });
  }
  return tabs;
}

// Shown in the form footer (or internal), not as editable fields.
const FALLBACK_HIDDEN = new Set([
  'createdon', 'modifiedon', 'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby', 'ownerid',
  'owningbusinessunit', 'owningteam', 'owninguser', 'versionnumber', 'importsequencenumber', 'overriddencreatedon',
  'timezoneruleversionnumber', 'utcconversiontimezonecode', 'statecode', 'statuscode',
]);

function fallbackForm(tableLogicalName: string): RecordForm {
  const attributes = tableAttributes(tableLogicalName);
  const lookups = new Set(attributes.filter((name) => columnMeta(tableLogicalName, name)?.kind === 'lookup'));
  const fields = attributes
    .filter((name) => name !== `${tableLogicalName}id` && !name.endsWith('_base') && !FALLBACK_HIDDEN.has(name))
    // Lookup display-name companions (e.g. cr301_degreename, owneridyominame) duplicate the lookup itself.
    .filter((name) => !(name.endsWith('yominame') || (name.endsWith('name') && lookups.has(name.slice(0, -4)))))
    .map((name) => fieldFor(name, tableLogicalName, null))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { name: 'All columns', tabs: [{ label: 'General', sections: [{ label: 'Details', fields, subgrids: [] }] }] };
}

const formCache = new Map<string, Promise<RecordForm>>();

export function loadMainForm(tableLogicalName: string): Promise<RecordForm> {
  const cached = formCache.get(tableLogicalName);
  if (cached) return cached;
  const forms = listRows({
    entitySet: 'systemforms',
    select: 'formid,name,formxml,isdefault',
    filter: `objecttypecode eq '${tableLogicalName}' and type eq 2 and formactivationstate eq 1`,
    orderBy: 'name asc',
  });
  const request = Promise.all([forms, loadRichTextColumns(tableLogicalName)]).then(([{ rows }, richColumns]) => {
    const form = rows.find((row) => row.isdefault === true) ?? rows[0];
    const tabs = typeof form?.formxml === 'string' ? parseFormXml(form.formxml, tableLogicalName) : [];
    const layout = tabs.length ? { name: String(form?.name ?? 'Main form'), tabs } : fallbackForm(tableLogicalName);
    // Columns formatted as "Rich text" get the editor even when the form XML doesn't say so.
    for (const tab of layout.tabs) {
      for (const section of tab.sections) {
        for (const field of section.fields) if (richColumns.has(field.name)) field.richText = true;
      }
    }
    return layout;
  });
  formCache.set(tableLogicalName, request);
  request.catch(() => formCache.delete(tableLogicalName));
  return request;
}
````

### `src/data/records.ts`

````ts
import { listRows, type DataverseRow } from './dataverse';

/** One record with all its columns (and formatted-value / lookup annotations). */
export async function getRecord(entitySet: string, logicalName: string, id: string): Promise<DataverseRow> {
  const { rows } = await listRows({ entitySet, filter: `${logicalName}id eq ${id}`, top: 1 });
  const record = rows[0];
  if (!record) throw new Error('This record no longer exists or you do not have access to it.');
  return record;
}
````

### `src/data/related.ts`

````ts
import { findTable, type TableRef } from '../app/navigation';
import { columnMeta, tableAttributes } from './columnMeta';
import { listRows, type ListResult } from './dataverse';
import type { FormSubgrid } from './forms';
import { lookupTableInfo, lookupTargetTable } from './lookups';
import { loadViewById, loadViews, pageFetchXml, pickView, withCondition, type TableView } from './views';

/**
 * Data for a form subgrid: the related table's records whose lookup points back to the record
 * being viewed, shown through the subgrid's own view (or the related table's default view).
 */

export interface SubgridData {
  table: TableRef;
  label: string;
  view: TableView;
  result: ListResult;
}

const SUBGRID_ROWS = 10;
// Audit/ownership lookups never carry a parent-child relationship shown in a subgrid.
const SYSTEM_LOOKUPS = new Set(['ownerid', 'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby', 'owningbusinessunit', 'owningteam', 'owninguser']);
const backReferenceCache = new Map<string, Promise<string | null>>();

/**
 * The lookup on the related table that points to `parentTable`. The saved schemas don't list lookup
 * targets, so candidates are checked against real data; names that appear in the relationship name
 * (e.g. cr301_doctorname in "cr301_newdoctordataset_cr301_table1_doctorname") are tried first.
 */
function findBackReference(related: TableRef, parentTable: string, relationship: string | null): Promise<string | null> {
  const key = `${related.logicalName}>${parentTable}>${relationship ?? ''}`;
  let cached = backReferenceCache.get(key);
  if (!cached) {
    cached = (async () => {
      const relationshipName = (relationship ?? '').toLowerCase();
      const lookups = tableAttributes(related.logicalName)
        .filter((name) => {
          const meta = columnMeta(related.logicalName, name);
          return meta?.kind === 'lookup' && meta.navigationProperty && !SYSTEM_LOOKUPS.has(name);
        })
        .sort((a, b) => Number(relationshipName.includes(b.replace(/^[a-z0-9]+_/, ''))) - Number(relationshipName.includes(a.replace(/^[a-z0-9]+_/, ''))));
      for (const attribute of lookups) {
        const target = await lookupTargetTable(related.entitySet, related.logicalName, attribute);
        if (target === parentTable) return attribute;
      }
      return null;
    })();
    backReferenceCache.set(key, cached);
  }
  return cached;
}

async function relatedTable(logicalName: string): Promise<{ table: TableRef; label: string } | null> {
  const known = findTable(logicalName);
  if (known) return known;
  const info = await lookupTableInfo(logicalName);
  return info ? { table: { logicalName, entitySet: info.entitySet, primaryName: info.primaryName }, label: logicalName } : null;
}

export async function loadSubgrid(subgrid: FormSubgrid, parentTable: string, parentId: string): Promise<SubgridData> {
  const related = await relatedTable(subgrid.targetTable);
  if (!related) throw new Error(`The related table ${subgrid.targetTable} isn't available here.`);
  const [backReference, view] = await Promise.all([
    findBackReference(related.table, parentTable, subgrid.relationship),
    (subgrid.viewId ? loadViewById(related.table, subgrid.viewId).catch(() => null) : Promise.resolve(null)).then(
      async (byId) => byId ?? pickView(await loadViews(related.table), null) ?? null,
    ),
  ]);
  if (!backReference) throw new Error('Related records can’t be matched to this record yet (no linked records found).');
  if (!view) throw new Error(`No view is available for ${related.label}.`);
  const fetchXml = pageFetchXml(withCondition(view.fetchXml, backReference, parentId), 1, SUBGRID_ROWS).fetchXml;
  const result = await listRows({ entitySet: related.table.entitySet, fetchXml });
  return { table: related.table, label: related.label, view, result };
}
````

### `src/data/recordActions.ts`

````ts
import type { TableRef } from '../app/navigation';
import { createRow, deleteRow, listRows, runAction, updateRow } from './dataverse';

/** A user or team that records can be assigned or shared to. */
export interface Principal {
  id: string;
  name: string;
  kind: 'systemuser' | 'team';
}

/** Active users and teams whose name contains the text (like the model-driven Assign/Share pickers). */
export async function searchPrincipals(text: string): Promise<Principal[]> {
  const escaped = text.replace(/'/g, "''");
  const contains = (attribute: string) => (text.trim() ? ` and contains(${attribute},'${escaped}')` : '');
  const [users, teams] = await Promise.all([
    listRows({ entitySet: 'systemusers', select: 'systemuserid,fullname', filter: `isdisabled eq false and accessmode ne 3${contains('fullname')}`, orderBy: 'fullname asc', top: 10 }),
    listRows({ entitySet: 'teams', select: 'teamid,name', filter: `teamtype eq 0${contains('name')}`, orderBy: 'name asc', top: 5 }),
  ]);
  return [
    ...users.rows.map((row) => ({ id: String(row.systemuserid), name: String(row.fullname ?? ''), kind: 'systemuser' as const })),
    ...teams.rows.map((row) => ({ id: String(row.teamid), name: String(row.name ?? ''), kind: 'team' as const })),
  ].filter((principal) => principal.id && principal.name);
}

const principalSet = (principal: Principal) => (principal.kind === 'team' ? 'teams' : 'systemusers');

/** Assign: change the record's owner (needs the Assign privilege). */
export function assignRecord(table: TableRef, id: string, owner: Principal): Promise<void> {
  return updateRow(table.entitySet, id, { 'ownerid@odata.bind': `/${principalSet(owner)}(${owner.id})` });
}

export type AccessRight = 'ReadAccess' | 'WriteAccess' | 'DeleteAccess' | 'AppendAccess' | 'AppendToAccess' | 'AssignAccess' | 'ShareAccess';

/** Share: grant a user/team access to one record (GrantAccess action; needs the Share privilege). */
export async function shareRecord(table: TableRef, id: string, principal: Principal, rights: readonly AccessRight[]): Promise<void> {
  await runAction('GrantAccess', {
    Target: { [`${table.logicalName}id`]: id, '@odata.type': `Microsoft.Dynamics.CRM.${table.logicalName}` },
    PrincipalAccess: {
      Principal: { [`${principal.kind}id`]: principal.id, '@odata.type': `Microsoft.Dynamics.CRM.${principal.kind}` },
      AccessMask: rights.join(', '),
    },
  });
}

// ---- Personal views ("My Views") ----

export interface PersonalViewInput {
  name: string;
  fetchXml: string;
  layoutXml: string;
}

/** Save as new view: creates a personal view (userquery) owned by the user. Returns its id when known. */
export async function createPersonalView(table: TableRef, view: PersonalViewInput): Promise<string | null> {
  const created = await createRow('userqueries', {
    name: view.name,
    returnedtypecode: table.logicalName,
    querytype: 0,
    fetchxml: view.fetchXml,
    layoutxml: view.layoutXml,
  });
  const id = created?.userqueryid;
  return typeof id === 'string' ? id : null;
}

export const updatePersonalView = (id: string, view: PersonalViewInput) =>
  updateRow('userqueries', id, { name: view.name, fetchxml: view.fetchXml, layoutxml: view.layoutXml });

export const deletePersonalView = (id: string) => deleteRow('userqueries', id);
````

### `src/data/formatCell.ts`

````ts
import DOMPurify from 'dompurify';
import type { ColumnKind } from './columnMeta';
import type { DataverseRow } from './dataverse';

/** What the formatter needs to know about a column/field (grid columns and form fields both fit). */
export interface ValueColumn {
  name: string;
  kind: ColumnKind;
}

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const LOOKUP_TABLE = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const MAX_CELL_LENGTH = 160;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

/** Rich-text (HTML) values flattened to one line of plain text for the grid. */
const stripHtml = (text: string) =>
  text.includes('<') || text.includes('&')
    ? decodeEntities(text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    : text;

const URL_PATTERN = /^(https?:\/\/|www\.)\S+$/i;

/**
 * Link target when the value is a plain URL (Iframe URL, System Link …).
 * Dataverse schemas here do not mark URL columns, so this is decided by the value itself.
 */
export function cellLink(row: DataverseRow, column: ValueColumn): string | null {
  if (column.kind !== 'text' && column.kind !== 'memo') return null;
  const raw = row[column.name];
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!URL_PATTERN.test(value)) return null;
  return value.toLowerCase().startsWith('www.') ? `https://${value}` : value;
}

export interface LookupTarget {
  /** Logical name of the referenced table. */
  table: string;
  id: string;
}

/** Referenced record of a lookup column (base-table lookups only; linked-entity columns have no target). */
export function lookupTarget(row: DataverseRow, column: ValueColumn): LookupTarget | null {
  if (column.kind !== 'lookup' || column.name.includes('.')) return null;
  const key = `_${column.name}_value`;
  const id = row[key];
  const table = row[`${key}${LOOKUP_TABLE}`];
  return typeof id === 'string' && typeof table === 'string' ? { table, id } : null;
}

/**
 * Display text for one value. Prefers the server's formatted value (lookup names, choice labels,
 * localized dates and numbers), which the connector returns because we request annotations.
 * Rich text is flattened to plain text; `truncate` shortens it for grid cells.
 */
export function formatCell(row: DataverseRow, column: ValueColumn, { truncate = true } = {}): string {
  const lookupKey = `_${column.name}_value`;
  const formatted = row[`${column.name}${FORMATTED}`] ?? row[`${lookupKey}${FORMATTED}`];
  const raw = formatted ?? row[column.name] ?? row[lookupKey];
  if (raw === null || raw === undefined || raw === '') return '';

  let text: string;
  if (typeof raw === 'boolean') text = raw ? 'Yes' : 'No';
  else if (column.kind === 'date' && formatted === undefined && typeof raw === 'string') {
    const date = new Date(raw);
    text = Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString();
  } else text = String(raw);

  text = stripHtml(text);
  return truncate && text.length > MAX_CELL_LENGTH ? `${text.slice(0, MAX_CELL_LENGTH - 1)}…` : text;
}

/** Rich text HTML with scripts, event handlers and unsafe URLs removed (DOMPurify). */
export const sanitizeRichText = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

/**
 * Sanitized HTML for rich-text (CKEditor) values, or null when the value is plain text.
 * Scripts, event handlers and unsafe URLs are removed by DOMPurify before rendering.
 */
export function richTextHtml(row: DataverseRow, column: ValueColumn): string | null {
  if (column.kind !== 'memo' && column.kind !== 'text') return null;
  const raw = row[column.name];
  if (typeof raw !== 'string' || !looksLikeHtml(raw)) return null;
  return sanitizeRichText(raw);
}
````

### `src/data/permissions.ts`

````ts
import { getContext } from '@microsoft/power-apps/app';
import { NAV_GROUPS } from '../app/navigation';
import { MicrosoftDataverseService } from '../generated';
import { DATA_ORG_URL } from './config';
import { listRows } from './dataverse';

/**
 * The signed-in user's table privileges in the data org, used to show/hide what the model-driven
 * app would hide: tables without Read, and New / Delete / Save / Activate without Create / Delete /
 * Write. Collected from the user's security roles, directly assigned and through team membership.
 *
 * This only drives the UI. Dataverse still enforces every privilege on every call, so if the check
 * cannot run (e.g. outside the Power Apps host, or the user can't read role data) everything is
 * shown and Dataverse's own "access denied" message is surfaced instead.
 */

export type PrivilegeAction = 'create' | 'read' | 'write' | 'delete' | 'assign' | 'share';

export interface UserPrivileges {
  /** False when privileges could not be read — then every check returns true. */
  known: boolean;
  can: (tableLogicalName: string, action: PrivilegeAction) => boolean;
}

const ACTIONS: Record<PrivilegeAction, string> = { create: 'Create', read: 'Read', write: 'Write', delete: 'Delete', assign: 'Assign', share: 'Share' };
const CONTEXT_TIMEOUT_MS = 4000;

export const ALLOW_ALL: UserPrivileges = { known: false, can: () => true };

const privilegeName = (tableLogicalName: string, action: PrivilegeAction) => `prv${ACTIONS[action]}${tableLogicalName}`.toLowerCase();

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** FetchXML: privileges (from our list) granted through roles linked to the user by `userLink`. */
function privilegesFetch(names: string[], userLink: string): string {
  const values = names.map((name) => `<value>${escapeXml(name)}</value>`).join('');
  // roleprivileges hang off the root role; the role a user actually holds is its business-unit copy,
  // which points back to the root through parentrootroleid.
  return `<fetch distinct="true"><entity name="privilege"><attribute name="name" /><filter><condition attribute="name" operator="in">${values}</condition></filter><link-entity name="roleprivileges" from="privilegeid" to="privilegeid" intersect="true"><link-entity name="role" from="parentrootroleid" to="roleid">${userLink}</link-entity></link-entity></entity></fetch>`;
}

async function currentUserId(): Promise<string | null> {
  const context = await Promise.race([
    getContext(),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), CONTEXT_TIMEOUT_MS)),
  ]);
  const objectId = context?.user.objectId;
  if (!objectId) return null;
  const { rows } = await listRows({ entitySet: 'systemusers', select: 'systemuserid', filter: `azureactivedirectoryobjectid eq ${objectId}`, top: 1 });
  const id = rows[0]?.systemuserid;
  return typeof id === 'string' ? id : null;
}

let previewPrivileges: UserPrivileges | null = null;

/** Dev preview only: pretend the signed-in user has these privileges. */
export function setPreviewPrivileges(privileges: UserPrivileges): void {
  previewPrivileges = privileges;
}

/** How the privileges were read (shown in development to check it). */
export let privilegesSource = 'not read';

/** Raw call to the data org (functions answer with an object, not a `value` list). */
async function callDataOrg(path: string): Promise<Record<string, unknown> | null> {
  const result = await MicrosoftDataverseService.ListRecordsWithOrganization(DATA_ORG_URL, path);
  if (result.error || !result.data || typeof result.data !== 'object') return null;
  return result.data as Record<string, unknown>;
}

/**
 * The user's own privileges through RetrieveUserPrivileges, as the model-driven app does. Any user
 * may ask this about themselves, so it doesn't need read access to security roles (which the
 * role-based read below does). Null when the function can't be called here.
 */
async function privilegesFromFunction(): Promise<Set<string> | null> {
  try {
    const me = await callDataOrg('WhoAmI');
    const userId = typeof me?.UserId === 'string' ? me.UserId : await currentUserId();
    if (!userId) return null;
    const answer = await callDataOrg(`systemusers(${userId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`);
    const list = answer?.RolePrivileges;
    if (!Array.isArray(list) || !list.length) return null;
    return new Set(list.map((item) => String((item as { PrivilegeName?: unknown }).PrivilegeName ?? '').toLowerCase()).filter(Boolean));
  } catch {
    return null;
  }
}

export async function loadUserPrivileges(): Promise<UserPrivileges> {
  if (previewPrivileges) return previewPrivileges;
  const fromFunction = await privilegesFromFunction();
  if (fromFunction) {
    privilegesSource = `RetrieveUserPrivileges (${fromFunction.size} privileges)`;
    return { known: true, can: (table, action) => fromFunction.has(privilegeName(table, action)) };
  }
  try {
    const userId = await currentUserId();
    if (!userId) {
      privilegesSource = 'user not found: every button shown, Dataverse still refuses what is not allowed';
      return ALLOW_ALL;
    }
    const tables = NAV_GROUPS.flatMap((group) => group.items).flatMap((item) => (item.kind === 'table' ? [item.table.logicalName] : []));
    const names = tables.flatMap((table) => (Object.keys(ACTIONS) as PrivilegeAction[]).map((action) => privilegeName(table, action)));
    const user = escapeXml(userId);
    const [direct, viaTeams] = await Promise.all([
      listRows({
        entitySet: 'privileges',
        fetchXml: privilegesFetch(names, `<link-entity name="systemuserroles" from="roleid" to="roleid" intersect="true"><filter><condition attribute="systemuserid" operator="eq" value="${user}" /></filter></link-entity>`),
      }),
      listRows({
        entitySet: 'privileges',
        fetchXml: privilegesFetch(names, `<link-entity name="teamroles" from="roleid" to="roleid" intersect="true"><link-entity name="teammembership" from="teamid" to="teamid" intersect="true"><filter><condition attribute="systemuserid" operator="eq" value="${user}" /></filter></link-entity></link-entity>`),
      }),
    ]);
    const granted = new Set([...direct.rows, ...viaTeams.rows].map((row) => String(row.name ?? '').toLowerCase()));
    privilegesSource = `security roles (${granted.size} privileges)`;
    return { known: true, can: (table, action) => granted.has(privilegeName(table, action)) };
  } catch {
    privilegesSource = 'could not be read: every button shown, Dataverse still refuses what is not allowed';
    return ALLOW_ALL;
  }
}
````

### `src/data/exportExcel.ts`

````ts
import type { DataverseRow } from './dataverse';
import { formatCell } from './formatCell';
import type { GridColumn } from './views';

/**
 * "Export to Excel" → Static Worksheet, like the model-driven export: the grid's columns (labels,
 * order) with typed cells — numbers stay numbers, dates stay dates (so Excel can sum / sort /
 * filter them), choices and lookups show their names, and rich text (HTML) becomes readable text
 * with its paragraphs, line breaks and bullets kept (wrapped in the cell).
 * The 'universal' build is used because it needs no Web Workers, which the Power Apps host may block.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const EXCEL_CELL_LIMIT = 32767;

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });

/** Rich text (HTML) → plain text keeping structure: one line per paragraph / line break, "• " bullets. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
    .trim();
}

const looksLikeHtml = (text: string) => /<[a-z][\s\S]*>/i.test(text);

type Cell = { value: string | number | Date | undefined; type?: StringConstructor | NumberConstructor | DateConstructor; format?: string; wrap?: boolean };

function cellFor(row: DataverseRow, column: GridColumn): Cell | null {
  const raw = row[column.name];
  // Numbers: the raw value (formatted value is text like "1,200.00").
  if (column.kind === 'number' && typeof raw === 'number') return { value: raw, type: Number };
  // Dates: a real Excel date; date-only values (midnight) without the time part.
  if (column.kind === 'date' && typeof raw === 'string' && raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw) || (date.getHours() === 0 && date.getMinutes() === 0);
      return { value: date, type: Date, format: dateOnly ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm' };
    }
  }
  // Rich text: structured plain text, wrapped.
  if (typeof raw === 'string' && row[`${column.name}${FORMATTED}`] === undefined && looksLikeHtml(raw)) {
    const text = htmlToText(raw).slice(0, EXCEL_CELL_LIMIT);
    return text ? { value: text, type: String, wrap: text.includes('\n') } : null;
  }
  // Everything else (choices, lookups, yes/no, text): the displayed value.
  const text = formatCell(row, column, { truncate: false }).slice(0, EXCEL_CELL_LIMIT);
  if (!text) return null;
  const multiline = typeof raw === 'string' && raw.includes('\n');
  return { value: multiline ? raw.slice(0, EXCEL_CELL_LIMIT) : text, type: String, wrap: multiline };
}

export async function exportToExcel(fileName: string, columns: readonly GridColumn[], rows: readonly DataverseRow[]): Promise<void> {
  const header = columns.map((column) => ({ value: column.label, fontWeight: 'bold' as const }));
  const body = rows.map((row) => columns.map((column) => cellFor(row, column)));
  // Loaded only when exporting, to keep it out of the app's first download. The synchronous zip is
  // used because the code app's CSP blocks Web Workers, which the async one needs (vite.config.ts).
  const { generateXlsxFileSync } = await import('write-excel-file-sync');
  const blob = await generateXlsxFileSync(
    [header, ...body],
    {
      sheet: 'Data',
      columns: columns.map((column) => ({ width: Math.max(10, Math.round(column.width / 7)) })),
      stickyRowsCount: 1,
    },
    undefined,
    async (content) => new Uint8Array(await content.arrayBuffer()),
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Export'}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
````

### `src/data/fileLinks.ts`

````ts
import { embedUrl, openInNewTab } from './hub/library';

/**
 * Links to documents on SharePoint (Excel, Word, PowerPoint, PDF) open in one pop-up window centred
 * on the screen (85%), everywhere in the app. SharePoint won't let the code-app host frame its pages
 * (frame-ancestors), and the app doesn't download files itself (user decision, 2026-09-30). The
 * window shows Office Online's clean read-only view; only its short "Opening…" screen is ours.
 */

const SHAREPOINT_HOST = /(^|\.)sharepoint\.com$/i;
const OFFICE_PAGE = /\/_layouts\/15\/(doc|doc2|wopiframe|wopiframe2|xlviewer)\.aspx$/i;
const SHARING_LINK = /^\/:[a-z]:\//i;
const DOCUMENT_FILE = /\.(xlsx|xlsm|xlsb|xls|csv|docx|docm|doc|pptx|pptm|ppt|pdf)$/i;

/** Whether a link points to a document on SharePoint (opened in the pop-up window). */
export function isSharePointDocument(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (!SHAREPOINT_HOST.test(url.hostname)) return false;
  return OFFICE_PAGE.test(url.pathname) || SHARING_LINK.test(url.pathname) || DOCUMENT_FILE.test(decodeURIComponent(url.pathname));
}

/**
 * Office Online's embed view (no ribbon or menus) with Excel's row/column headers and gridlines
 * hidden, so a designed sheet reads like a page. Other links are returned unchanged.
 */
function cleanViewUrl(raw: string): string {
  const embed = embedUrl(raw);
  if (!/action=embedview/i.test(embed)) return raw;
  const url = new URL(embed);
  url.searchParams.delete('mobileredirect');
  url.searchParams.set('wdHideHeaders', 'True');
  url.searchParams.set('wdHideGridlines', 'True');
  return url.toString();
}

const POPUP_NAME = 'servicehub-file';
const POPUP_SHARE = 0.85;

/** Each further open window is shifted by this much, so stacked windows stay visible. */
const CASCADE = 32;

/** Centred at 85% of the screen; the n-th extra open window is shifted down-right. */
function popupFeatures(shift: number): string {
  const width = Math.round(screen.availWidth * POPUP_SHARE);
  const height = Math.round(screen.availHeight * POPUP_SHARE);
  const screenLeft = (screen as Screen & { availLeft?: number }).availLeft ?? 0;
  const screenTop = (screen as Screen & { availTop?: number }).availTop ?? 0;
  const room = Math.min(screen.availWidth - width, screen.availHeight - height) / 2;
  const offset = room > 0 ? (shift * CASCADE) % Math.max(CASCADE, room) : 0;
  const left = Math.round(screenLeft + (screen.availWidth - width) / 2 + offset);
  const top = Math.round(screenTop + (screen.availHeight - height) / 2 + offset);
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

/**
 * One window per link (kept by reference: with its opener cleared, a window name no longer finds
 * it). Opening a link again brings its window to the front; another link gets its own window.
 */
const windows = new Map<string, Window>();
let opened = 0;

function openWindows(): number {
  for (const [key, popup] of windows) if (popup.closed) windows.delete(key);
  return windows.size;
}

/** The app-styled screen shown until Office Online loads. */
function paintOpening(popup: Window, name: string): void {
  const doc = popup.document;
  doc.title = name ? `${name} · ServiceHub` : 'ServiceHub';
  doc.head.innerHTML = `<style>
    *{box-sizing:border-box}
    body{margin:0;height:100vh;display:flex;flex-direction:column;font-family:'Urbanist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Arial,sans-serif;background:#f3f5f6;color:#1d2b2a}
    header{display:flex;align-items:center;gap:10px;padding:0 18px;height:52px;background:linear-gradient(90deg,#063b36,#0d594b);color:#fff;font-weight:700;font-size:16px}
    .logo{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:linear-gradient(135deg,#2fd3a3,#126e5c);font-size:12px}
    main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
    .spin{width:34px;height:34px;border-radius:50%;border:3px solid #d9f8ec;border-top-color:#126e5c;animation:s .8s linear infinite}
    .name{font-weight:700;font-size:17px}.sub{color:#6b7775;font-size:14px}
    @keyframes s{to{transform:rotate(360deg)}}
  </style>`;
  doc.body.innerHTML = '<header><span class="logo">SH</span>ServiceHub</header><main><div class="spin"></div><div class="name"></div><div class="sub">Opening…</div></main>';
  const label = doc.querySelector('.name');
  if (label) label.textContent = name;
}

/** Opens a document in its own pop-up window (brought to the front if already open); a new tab if pop-ups are blocked. */
export function openInPopup(url: string, name = ''): void {
  const key = url.trim();
  const existing = windows.get(key);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }
  const shift = openWindows();
  opened += 1;
  const popup = window.open('', `${POPUP_NAME}-${opened}`, popupFeatures(shift));
  if (!popup) {
    openInNewTab(url);
    return;
  }
  paintOpening(popup, name);
  popup.opener = null;
  windows.set(key, popup);
  popup.location.href = cleanViewUrl(url);
  popup.focus();
}

/** Opens one link: documents in the pop-up window; with `newTab` (system links), other sites in a new tab. */
export function openLink(link: string, name = '', newTab = false): void {
  if (newTab && !isSharePointDocument(link)) openInNewTab(link);
  else openInPopup(link, name);
}

/**
 * Click handler for plain <a href> links (grids, forms): SharePoint documents go to the pop-up
 * window instead of a new tab; other links keep their normal behaviour.
 */
export function onFileLinkClick(event: { preventDefault: () => void; stopPropagation: () => void }, url: string, name = ''): void {
  event.stopPropagation();
  if (!isSharePointDocument(url)) return;
  event.preventDefault();
  openInPopup(url, name);
}
````

### `scripts/build-column-labels.mjs`

````js
// Builds src/data/columnLabels.generated.ts from reference/dataverse-schemas/*.Schema.json.
//
// Why: a view's layoutxml / form xml only lists attribute logical names; the grid, filters and
// forms need each column's label, kind, choice options and editing rules. The raw schemas are
// ~600 KB, so only what the app uses is shipped.
// Run `npm run labels` after refreshing a schema in reference/dataverse-schemas.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = join(root, 'reference/dataverse-schemas');
const output = join(root, 'src/data/columnLabels.generated.ts');

/** Dataverse attribute type -> column kind used by grid, filters and forms. */
const KIND = {
  LookupType: 'lookup',
  OwnerType: 'lookup',
  CustomerType: 'lookup',
  PicklistType: 'choice',
  MultiSelectPicklistType: 'choice',
  StateType: 'choice',
  StatusType: 'choice',
  BooleanType: 'choice',
  DateTimeType: 'date',
  MemoType: 'memo',
  IntegerType: 'number',
  BigIntType: 'number',
  DecimalType: 'number',
  DoubleType: 'number',
  MoneyType: 'number',
};

const tables = {};
for (const file of readdirSync(schemaDir).filter((name) => name.endsWith('.json')).sort()) {
  const schema = JSON.parse(readFileSync(join(schemaDir, file), 'utf8'));
  const columns = {};
  for (const [attribute, meta] of Object.entries(schema.schema.items.properties ?? {})) {
    const type = meta['x-ms-dataverse-type'];
    if (type === 'VirtualType' || type === 'FileType' || type === 'ImageType') continue;
    const column = { l: meta.title ?? attribute, k: KIND[type] ?? 'text' };
    if (type === 'BooleanType') column.o = [[1, 'Yes'], [0, 'No']];
    else if (Array.isArray(meta.enum) && Array.isArray(meta['x-ms-enum-values'])) {
      column.o = meta['x-ms-enum-values'].map((value, index) => [value, meta.enum[index]]);
    }
    if (type === 'MultiSelectPicklistType') column.m = 1;
    if (type === 'BooleanType') column.b = 1;
    if (meta.required) column.r = 1;
    if (meta['x-ms-read-only']) column.ro = 1;
    if (typeof meta.maxLength === 'number') column.x = meta.maxLength;
    if (type === 'LookupType' || type === 'CustomerType') column.s = meta['x-ms-schema-name'];
    columns[attribute] = column;
  }
  tables[schema.name] = columns;
}

const lines = [
  '// AUTO-GENERATED by scripts/build-column-labels.mjs from reference/dataverse-schemas — do not edit.',
  '// Run `npm run labels` to regenerate.',
  "export type ColumnKind = 'lookup' | 'choice' | 'date' | 'memo' | 'number' | 'text';",
  '',
  '/** Compact column metadata (short keys keep the bundle small). */',
  'export interface RawColumnMeta {',
  '  /** label */ l: string;',
  '  /** kind */ k: ColumnKind;',
  '  /** choice options: [value, label] */ o?: readonly (readonly [number, string])[];',
  '  /** multi-select choice */ m?: 1;',
  '  /** two-option (boolean) */ b?: 1;',
  '  /** required */ r?: 1;',
  '  /** read-only */ ro?: 1;',
  '  /** max length */ x?: number;',
  '  /** lookup schema name (navigation property for @odata.bind) */ s?: string;',
  '}',
  '',
  '/** table logical name -> attribute logical name -> metadata */',
  `export const COLUMN_META: Record<string, Record<string, RawColumnMeta>> = ${JSON.stringify(tables)};`,
  '',
];
writeFileSync(output, lines.join('\n'));
console.log(`column metadata: ${Object.keys(tables).length} tables -> src/data/columnLabels.generated.ts`);
````

### `src/app/AppShell.tsx`

````tsx
import { lazy, Suspense, useCallback, useState, type KeyboardEvent } from 'react';
import { ArrowDown2, HambergerMenu, Moon, Sun1 } from 'iconsax-react';
import { DEFAULT_HUB_SECTION_ID, type HubSectionId } from './hubSections';
import { DEFAULT_NAV_ITEM_ID, NAV_GROUPS, SERVICE_HUB_ITEM, getNavItem, type NavItem } from './navigation';
import { usePermissions } from './permissionsContext';
import { privilegesSource } from '../data/permissions';
import { REGION_LABEL, REGION_MARK, type Region } from './region';
import { useRegionContext } from './regionContext';
import { RegionModal } from './RegionModal';
import { useCurrentUser } from './useCurrentUser';
import { TEXT_SIZES, readCollapsedGroups, readTextSize, textZoom, writeCollapsedGroups, writeTextSize, type TextSizeId } from './preferences';

// Loaded on first use, so the app opens without downloading both halves (and the rich text editor).
const ServiceHubScreen = lazy(() => import('../screens/ServiceHubScreen').then((module) => ({ default: module.ServiceHubScreen })));
const TableScreen = lazy(() => import('../screens/TableScreen').then((module) => ({ default: module.TableScreen })));

function ScreenLoading() {
  return (
    <div className="content">
      <div className="loader-box" role="status">
        <div className="loader-ring" />
        <div className="loader-text">Loading…</div>
      </div>
    </div>
  );
}

const THEME_STORAGE_KEY = 'servicehub.theme';

function readStoredDarkMode(): boolean {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Keyboard activation for the div-based sidebar items (markup/classes kept identical to base.css). */
const activateOnKey = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

export function AppShell() {
  const { region, setRegion } = useRegionContext();
  const user = useCurrentUser();
  const [activeItemId, setActiveItemId] = useState<string>(DEFAULT_NAV_ITEM_ID);
  // Kept here (not inside the hub screen) so the chosen section survives visiting a table and coming back.
  const [hubSectionId, setHubSectionId] = useState<HubSectionId>(DEFAULT_HUB_SECTION_ID);
  const [darkMode, setDarkMode] = useState(readStoredDarkMode);
  const [textSize, setTextSizeState] = useState<TextSizeId>(readTextSize);
  const setTextSize = useCallback((size: TextSizeId) => {
    setTextSizeState(size);
    writeTextSize(size);
  }, []);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Sidebar sections the user folded (remembered in this browser).
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(readCollapsedGroups);
  const toggleGroup = (id: string) =>
    setCollapsedGroups((current) => {
      const next = current.includes(id) ? current.filter((groupId) => groupId !== id) : [...current, id];
      writeCollapsedGroups(next);
      return next;
    });

  const { ready: permissionsReady, privileges } = usePermissions();
  // Tables the user has no Read privilege on are hidden, as in the model-driven sitemap.
  // Until privileges are known, table entries wait (the Service Hub page is always available).
  const isVisible = (item: NavItem) => item.kind === 'hub' || (permissionsReady && privileges.can(item.table.logicalName, 'read'));
  const requestedItem = getNavItem(activeItemId);
  const activeItem = isVisible(requestedItem) ? requestedItem : SERVICE_HUB_ITEM;
  const userName = user?.fullName ?? '';

  const setTheme = useCallback((dark: boolean) => {
    setDarkMode(dark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // Preference just won't persist.
    }
  }, []);

  const openItem = useCallback((id: string) => {
    setActiveItemId(id);
    setMobileSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  const openHubSection = useCallback((id: HubSectionId) => {
    setHubSectionId(id);
    window.scrollTo({ top: 0 });
  }, []);

  const pickRegion = useCallback(
    (next: Region) => {
      setRegion(next);
      setRegionModalOpen(false);
    },
    [setRegion],
  );

  return (
    <div className={`servhub-app${darkMode ? ' dark' : ''}`}>
      <nav className="navbar">
        <div className="nav-l">
          <button
            type="button"
            className="nav-burger"
            aria-label="Open menu"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen((open) => !open)}
          >
            <HambergerMenu size={16} color="currentColor" />
          </button>
          <div className="nav-brand">SH</div>
          <div className="nav-title">ServiceHub</div>
        </div>
        <div className="nav-r">
          <div className="text-size-toggle" role="group" aria-label="Text size">
            {TEXT_SIZES.map((size, index) => (
              <button
                key={size.id}
                type="button"
                className={`text-size-btn size-${index}${size.id === textSize ? ' active' : ''}`}
                title={size.title}
                aria-label={size.title}
                aria-pressed={size.id === textSize}
                onClick={() => setTextSize(size.id)}
              >
                {size.label}
              </button>
            ))}
          </div>
          {/* Region drives the Service Hub page and which view (EGY / KSA) each table opens on. */}
          <button
            type="button"
            className="region-chip"
            onClick={() => setRegionModalOpen(true)}
            aria-label={region ? `Region: ${REGION_LABEL[region]}. Change region` : 'Select region'}
          >
            {region && <span className="rb-flag">{REGION_MARK[region]}</span>}
            {region ? REGION_LABEL[region] : 'Select region'}
            <span className="rb-chevron">▼</span>
          </button>
          {userName && (
            <>
              <span className="nav-dot" />
              <span className="nav-user">{userName}</span>
              <div className="nav-avatar" aria-hidden="true">{initialsOf(userName)}</div>
            </>
          )}
        </div>
      </nav>

      <div className="shell">
        <aside className={`sidebar${mobileSidebarOpen ? ' mobile-open' : ''}`} aria-label="ServiceHub navigation">
          <div className="sb-brand">
            <div className="sb-app">ServiceHub</div>
            <div className="sb-org">ANDALUSIA GROUP</div>
            {/* Development only: how the signed-in user's privileges were read (see permissions.ts). */}
            {import.meta.env.DEV && permissionsReady && <div className="sb-org" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 4 }}>Permissions: {privilegesSource}</div>}
          </div>
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(isVisible);
            if (!items.length && permissionsReady) return null;
            return (
            <div key={group.id} role="group" aria-label={group.label}>
              <button
                type="button"
                className={`sb-label sb-group-toggle${collapsedGroups.includes(group.id) ? ' collapsed' : ''}`}
                aria-expanded={!collapsedGroups.includes(group.id)}
                onClick={() => toggleGroup(group.id)}
              >
                <span>{group.label}</span>
                <ArrowDown2 className="sb-group-chevron" size={12} color="currentColor" />
              </button>
              {!collapsedGroups.includes(group.id) && !permissionsReady && group.items.some((item) => item.kind === 'table') && (
                <div className="sb-item" aria-busy="true" style={{ cursor: 'default', opacity: 0.6 }}>
                  <span className="sb-item-text">Checking access…</span>
                </div>
              )}
              {!collapsedGroups.includes(group.id) && items.map((item) => {
                const active = item.id === activeItem.id;
                const ItemIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className={`sb-item${active ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => openItem(item.id)}
                    onKeyDown={activateOnKey(() => openItem(item.id))}
                  >
                    <ItemIcon size={16} color="currentColor" variant={active ? 'Bold' : 'Linear'} />
                    <span className="sb-item-text">{item.label}</span>
                  </div>
                );
              })}
            </div>
            );
          })}
          <div className="sb-theme-toggle" role="group" aria-label="Theme">
            <button type="button" className={`theme-btn${darkMode ? '' : ' active'}`} aria-pressed={!darkMode} onClick={() => setTheme(false)}>
              <Sun1 size={14} color="currentColor" />
              Light
            </button>
            <button type="button" className={`theme-btn${darkMode ? ' active' : ''}`} aria-pressed={darkMode} onClick={() => setTheme(true)}>
              <Moon size={14} color="currentColor" />
              Dark
            </button>
          </div>
        </aside>
        <div
          className={`sidebar-backdrop${mobileSidebarOpen ? ' show' : ''}`}
          role="presentation"
          onClick={() => setMobileSidebarOpen(false)}
        />
        {/* Text size scales the whole content area, so spacing grows with the fonts. */}
        <main className="main" style={{ zoom: textZoom(textSize) }}>
          <Suspense fallback={<ScreenLoading />}>
            {activeItem.kind === 'hub' ? (
              <ServiceHubScreen
                region={region}
                onSelectRegion={setRegion}
                sectionId={hubSectionId}
                onSelectSection={openHubSection}
              />
            ) : (
              <TableScreen key={activeItem.id} label={activeItem.label} table={activeItem.table} region={region} />
            )}
          </Suspense>
        </main>
      </div>

      {regionModalOpen && (
        <RegionModal current={region} onSelect={pickRegion} onCancel={() => setRegionModalOpen(false)} />
      )}
    </div>
  );
}
````

### `src/app/navigation.ts`

````ts
import { Element3, Monitor, type Icon } from 'iconsax-react';

/**
 * Sidebar registry — mirrors the model-driven app's sitemap (areas, order and display names)
 * so users find everything where they already expect it. Display names, entity sets and primary
 * name columns come from Dataverse (reference/dataverse-schemas), not guesses.
 */

export interface TableRef {
  /** Logical name, e.g. `cr301_newdoctordataset`. Primary key is always `${logicalName}id`. */
  logicalName: string;
  /** Web API entity set, e.g. `cr301_newdoctordatasets`. */
  entitySet: string;
  /** Primary name column (the record's title). */
  primaryName: string;
}

export type NavItem =
  | { kind: 'hub'; id: 'service-hub'; label: string; icon: Icon }
  | { kind: 'table'; id: string; label: string; icon: Icon; table: TableRef };

export interface NavGroup {
  id: 'general' | 'quick-links' | 'health-libraries';
  label: string;
  items: NavItem[];
}

const table = (label: string, logicalName: string, entitySet: string, primaryName: string): NavItem => ({
  kind: 'table',
  id: logicalName,
  label,
  icon: Element3,
  table: { logicalName, entitySet, primaryName },
});

export const SERVICE_HUB_ITEM: NavItem = { kind: 'hub', id: 'service-hub', label: 'Andalusia Service Hub', icon: Monitor };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      SERVICE_HUB_ITEM,
      table('New Doctor Datasets', 'cr301_newdoctordataset', 'cr301_newdoctordatasets', 'cr301_title'),
      table('Service Datasets', 'cr301_ksaservicedataset', 'cr301_ksaservicedatasets', 'cr301_title'),
      table('COELists', 'cr301_coelist', 'cr301_coelists', 'cr301_coeclinicname'),
      table('DetailsByBUS', 'cr301_detailsbybu', 'cr301_detailsbybus', 'cr301_newcolumn'),
      table('SpecialtyDetails', 'cr301_specialtydetail', 'cr301_specialtydetails', 'cr301_newcolumn'),
      table('AndalusiaLocations', 'cr301_andalusialocations', 'cr301_andalusialocationses', 'cr301_branchname'),
      table('BankAccounts', 'cr301_bankaccounts', 'cr301_bankaccountses', 'cr301_newcolumn'),
      table('Canvas Page Usage Logs', 'cr301_canvaspageusagelog', 'cr301_canvaspageusagelogs', 'cr301_newcolumn'),
      table('New BU Fees', 'cr301_table1', 'cr301_table1s', 'cr301_title'),
      table('ServHub Specialty Mappings', 'cr18c_servhubspecialtymapping', 'cr18c_servhubspecialtymappings', 'cr18c_name'),
      table('Procedcure Clinics', 'servhub_procedcureclinc', 'servhub_procedcureclincs', 'servhub_clinic'),
      table('New Offer Datasets', 'cr301_newofferdataset', 'cr301_newofferdatasets', 'cr301_title'),
      table('ServHub Programs', 'cr18c_servhubprogram', 'cr18c_servhubprograms', 'cr18c_name'),
      table('ServHub HomeCares', 'cr18c_servhubhomecare', 'cr18c_servhubhomecares', 'cr18c_name'),
      table('Specialty KSA_Service_Hubs', 'cr301_specialtyksa_service_hub', 'cr301_specialtyksa_service_hubs', 'cr301_title'),
      table('Offer Requests', 'new_offer_equest', 'new_offer_equests', 'new_name'),
      table('SubCategories', 'cr301_subcategory', 'cr301_subcategories', 'cr301_newcolumn'),
    ],
  },
  {
    id: 'quick-links',
    label: 'Quick Links',
    items: [
      table('Scripts', 'cr301_scripts', 'cr301_scriptses', 'cr301_newcolumn'),
      table('Service Hub Insurance Companies', 'cr18c_servicehubinsurancecompany', 'cr18c_servicehubinsurancecompanies', 'cr18c_companyname'),
      table('Department Working Hours', 'cr18c_departmentworkinghours', 'cr18c_departmentworkinghourses', 'cr18c_name'),
      table('ServHub Quality Assurance Tips', 'cr18c_servhubqualityassurancetips', 'cr18c_servhubqualityassurancetipses', 'cr18c_tipname'),
      table('ServHub CRM Dictionaries', 'cr18c_servhubcrmdictionary', 'cr18c_servhubcrmdictionaries', 'cr18c_reason'),
      table('ServHub Events', 'cr18c_servhubevent', 'cr18c_servhubevents', 'cr18c_name'),
      table('ServHub Special Handlings', 'cr18c_servhubspecialhandling', 'cr18c_servhubspecialhandlings', 'cr18c_name'),
      table('ServHub Installments', 'cr18c_servhubinstallment', 'cr18c_servhubinstallments', 'cr18c_name'),
      table('ServHub System links', 'cr18c_servhubsystemlink', 'cr18c_servhubsystemlinks', 'cr18c_systemlink'),
      table('ServHub Booking policies', 'cr18c_servhubbookingpolicy', 'cr18c_servhubbookingpolicies', 'cr18c_name'),
    ],
  },
  {
    id: 'health-libraries',
    label: 'Health libraries',
    items: [
      table('ServHub CPG & Protocols', 'cr18c_servhubcpgprotocol', 'cr18c_servhubcpgprotocols', 'cr18c_name'),
      table('ServHub CAPEXES', 'cr18c_servhubcapex', 'cr18c_servhubcapexes', 'cr18c_name'),
      table('Other Health Infos', 'cr18c_otherhealthinfo', 'cr18c_otherhealthinfos', 'cr18c_name'),
    ],
  },
];

const itemById = new Map<string, NavItem>(NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]));

export const DEFAULT_NAV_ITEM_ID = SERVICE_HUB_ITEM.id;

export const getNavItem = (id: string): NavItem => itemById.get(id) ?? SERVICE_HUB_ITEM;

/** Sidebar table for a logical name (e.g. the target of a lookup), if ServiceHub has one. */
export function findTable(logicalName: string): { label: string; table: TableRef } | undefined {
  const item = itemById.get(logicalName);
  return item?.kind === 'table' ? { label: item.label, table: item.table } : undefined;
}
````

### `src/app/preferences.ts`

````ts
/**
 * Per-user display preferences kept in localStorage (browser-only conveniences; a blocked or
 * cleared storage just falls back to the defaults).
 */

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference just won't persist.
  }
}

// ---- Text size (call-center agents work on it all day, so it starts larger than base.css) ----

export const TEXT_SIZES = [
  { id: 'normal', label: 'A', title: 'Normal text', zoom: 1 },
  { id: 'large', label: 'A', title: 'Large text', zoom: 1.15 },
  { id: 'xlarge', label: 'A', title: 'Extra large text', zoom: 1.3 },
] as const;

export type TextSizeId = (typeof TEXT_SIZES)[number]['id'];

const TEXT_SIZE_KEY = 'servicehub.textsize';
// Synapse's 14px base already matches the old "Large" size, so Normal is the default.
export const DEFAULT_TEXT_SIZE: TextSizeId = 'normal';

export function readTextSize(): TextSizeId {
  const stored = read(TEXT_SIZE_KEY);
  return TEXT_SIZES.some((size) => size.id === stored) ? (stored as TextSizeId) : DEFAULT_TEXT_SIZE;
}

export const writeTextSize = (size: TextSizeId) => write(TEXT_SIZE_KEY, size);

export const textZoom = (size: TextSizeId) => TEXT_SIZES.find((item) => item.id === size)?.zoom ?? 1;

/**
 * The CSS zoom applied to an element (1 when unsupported). Pointer coordinates and
 * getBoundingClientRect are in viewport pixels, while sizes/positions set inside a zoomed element
 * are multiplied by the zoom, so divide by this when converting between them.
 */
export function cssZoom(element: Element): number {
  const zoom = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === 'number' && zoom > 0 ? zoom : 1;
}

// ---- Doctors Directory: cards per row ----

export const DOCTOR_COLUMN_CHOICES = [2, 3, 4] as const;
const DOCTOR_COLUMNS_KEY = 'servicehub.doctors.perRow';
export const DEFAULT_DOCTOR_COLUMNS = 4;

export function readDoctorColumns(): number {
  const stored = Number(read(DOCTOR_COLUMNS_KEY));
  return (DOCTOR_COLUMN_CHOICES as readonly number[]).includes(stored) ? stored : DEFAULT_DOCTOR_COLUMNS;
}

export const writeDoctorColumns = (columns: number) => write(DOCTOR_COLUMNS_KEY, String(columns));





// ---- Sidebar: collapsed sections (like the model-driven sitemap groups) ----

const COLLAPSED_GROUPS_KEY = 'servicehub.sidebar.collapsed';

export function readCollapsedGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(COLLAPSED_GROUPS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function writeCollapsedGroups(ids: readonly string[]): void {
  write(COLLAPSED_GROUPS_KEY, JSON.stringify(ids));
}
````

### `src/app/PermissionsProvider.tsx`

````tsx
import { useMemo, type ReactNode } from 'react';
import { ALLOW_ALL, loadUserPrivileges } from '../data/permissions';
import { useAsyncData } from '../data/useAsyncData';
import { PermissionsContext } from './permissionsContext';

/** Reads the signed-in user's table privileges once when the app opens. */
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const result = useAsyncData('privileges', loadUserPrivileges);
  const value = useMemo(
    () => ({ ready: !result.loading, privileges: result.data ?? ALLOW_ALL }),
    [result.loading, result.data],
  );
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}
````

### `src/app/permissionsContext.ts`

````ts
import { createContext, useContext } from 'react';
import { ALLOW_ALL, type UserPrivileges } from '../data/permissions';

export interface PermissionsState {
  /** False while the user's privileges are still being read. */
  ready: boolean;
  privileges: UserPrivileges;
}

export const PermissionsContext = createContext<PermissionsState>({ ready: true, privileges: ALLOW_ALL });

export const usePermissions = () => useContext(PermissionsContext);
````

### `src/app/useCurrentUser.ts`

````ts
import { useEffect, useState } from 'react';
import { getContext } from '@microsoft/power-apps/app';

export interface CurrentUser {
  fullName: string;
  userPrincipalName: string;
}

// Outside the Power Apps host (plain `vite` preview) getContext never resolves, so give up after this.
const CONTEXT_TIMEOUT_MS = 4000;

const timeout = (ms: number) =>
  new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('Power Apps context timed out')), ms);
  });

/** Signed-in user from the Power Apps host, or null until (or unless) it is available. */
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.race([getContext(), timeout(CONTEXT_TIMEOUT_MS)])
      .then((context) => {
        if (cancelled) return;
        setUser({
          fullName: context.user.fullName ?? '',
          userPrincipalName: context.user.userPrincipalName ?? '',
        });
      })
      .catch(() => {
        // Not running inside Power Apps — the header falls back to a neutral label.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return user;
}
````

### `src/screens/TableScreen.tsx`

````tsx
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
        compact
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
````

### `src/screens/RecordForm.tsx`

````tsx
import { useState } from 'react';
import { ArrowDown2, ArrowLeft, ArrowUp2, CloseCircle, Profile2User, Refresh, Share, TickCircle, Trash } from 'iconsax-react';
import type { TableRef } from '../app/navigation';
import { usePermissions } from '../app/permissionsContext';
import { loadLiveColumnMeta, type ColumnMeta } from '../data/columnMeta';
import { createRow, deleteRow, errorMessage, setRowState, updateRow, type DataverseRow } from '../data/dataverse';
import { formatCell, richTextHtml } from '../data/formatCell';
import { formFields, loadMainForm, type FormField, type RecordForm as RecordFormLayout } from '../data/forms';
import { lookupTargetTable } from '../data/lookups';
import { getRecord } from '../data/records';
import { useAsyncData } from '../data/useAsyncData';
import { FieldEditor, type DraftValue } from './form/FieldEditor';
import { AssignDialog, ShareDialog } from './form/RecordDialogs';
import { RichTextField } from './form/RichTextField';
import { SubgridView } from './form/SubgridView';
import { SYSTEM_READ_ONLY, buildPayload, currentValue, isEmptyValue, metaFor } from './form/values';
import { ConfirmDialog } from './grid/ConfirmDialog';

export interface FormTarget {
  table: TableRef;
  /** Table display name (sidebar label). */
  label: string;
  /** null = new record. */
  id: string | null;
  /** Record ids of the grid page the record was opened from, for the ↑ / ↓ record navigation. */
  siblings?: readonly string[];
}

interface RecordFormProps {
  target: FormTarget;
  notify: (kind: 'success' | 'alert', text: string) => void;
  /** A record was created, updated, deleted, assigned or (de)activated — the grid should reload. */
  onChanged: () => void;
  onClose: () => void;
}

/**
 * Model-driven style record form (New / Edit), laid out from the table's main form: tabs,
 * sections, fields and subgrids. Lookups and subgrid rows open related records in place ("Back"
 * returns); ↑ / ↓ move through the grid's records like the model-driven record navigation.
 */
export function RecordForm({ target, notify, onChanged, onClose }: RecordFormProps) {
  const [stack, setStack] = useState<FormTarget[]>([target]);
  // Bumped on every switch so the form always starts clean — also new → new after "Save & New".
  const [instance, setInstance] = useState(0);
  const current = stack[stack.length - 1];
  const replaceCurrent = (next: FormTarget) => {
    setStack((items) => [...items.slice(0, -1), next]);
    setInstance((count) => count + 1);
  };
  return (
    <FormBody
      key={`${current.table.logicalName}#${current.id ?? 'new'}#${stack.length}#${instance}`}
      target={current}
      backTo={stack.length > 1 ? stack[stack.length - 2].label : null}
      onBack={() => setStack((items) => items.slice(0, -1))}
      onOpenRelated={(related) => setStack((items) => [...items, related])}
      onNavigate={(id) => replaceCurrent({ ...current, id })}
      onNew={() => replaceCurrent({ ...current, id: null })}
      notify={notify}
      onChanged={onChanged}
      onClose={onClose}
    />
  );
}

type PendingAction = 'delete' | 'activate' | 'deactivate' | null;
type OpenDialog = 'assign' | 'share' | null;

interface FormBodyProps {
  target: FormTarget;
  backTo: string | null;
  onBack: () => void;
  onOpenRelated: (target: FormTarget) => void;
  /** Show another record in this form (after create, or ↑ / ↓). */
  onNavigate: (id: string) => void;
  /** Save & New: continue with a blank record of the same table. */
  onNew: () => void;
  notify: RecordFormProps['notify'];
  onChanged: () => void;
  onClose: () => void;
}

function FormBody({ target, backTo, onBack, onOpenRelated, onNavigate, onNew, notify, onChanged, onClose }: FormBodyProps) {
  const { table } = target;
  const isNew = target.id === null;
  const [reload, setReload] = useState(0);
  const { privileges } = usePermissions();
  const canCreate = privileges.can(table.logicalName, 'create');
  const canWrite = privileges.can(table.logicalName, 'write');
  const canDelete = privileges.can(table.logicalName, 'delete');
  const canAssign = privileges.can(table.logicalName, 'assign');
  const canShare = privileges.can(table.logicalName, 'share');
  // A new record needs Create; an existing one needs Write. Without it the form is read-only.
  const canSave = isNew ? canCreate : canWrite;
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tabIndex, setTabIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);

  const details = useAsyncData<[RecordFormLayout, DataverseRow]>(`${table.logicalName}#${target.id ?? 'new'}#${reload}`, () =>
    // Fields are built from the table's metadata: read it live first (new columns), see columnMeta.ts.
    loadLiveColumnMeta(table.logicalName, table.entitySet).then(() =>
      Promise.all([loadMainForm(table.logicalName), target.id ? getRecord(table.entitySet, table.logicalName, target.id) : Promise.resolve({})]),
    ),
  );
  const [layout, row] = details.data ?? [];
  const title = row && !isNew ? formatCell(row, { name: table.primaryName, kind: 'text' }, { truncate: false }) : '';
  const dirty = Object.keys(draft).length > 0;
  const active = row ? row.statecode !== 1 : true;
  const tabs = layout?.tabs ?? [];
  const activeTab = tabs[Math.min(tabIndex, Math.max(tabs.length - 1, 0))];

  const siblings = target.siblings ?? [];
  const position = target.id ? siblings.indexOf(target.id) : -1;

  const isReadOnly = (field: FormField, meta: ColumnMeta) =>
    !canSave || meta.readOnly || SYSTEM_READ_ONLY.has(field.name) || (meta.kind === 'lookup' && !meta.navigationProperty);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    for (const field of layout ? formFields(layout) : []) {
      const meta = metaFor(table.logicalName, field);
      if (!meta.required || isReadOnly(field, meta)) continue;
      // Existing records: only fields the user cleared block the save. Records created by imports or
      // integrations may already have an empty required field; editing another field must still work.
      if (!isNew && !(field.name in draft)) continue;
      const value = field.name in draft ? draft[field.name] : currentValue(row ?? {}, meta);
      if (isEmptyValue(value)) next[field.name] = `${field.label} is required.`;
    }
    setErrors(next);
    // Like the model-driven form, jump to the first tab that has a missing required field.
    const firstError = tabs.findIndex((tab) => tab.sections.some((section) => section.fields.some((field) => next[field.name])));
    if (firstError >= 0) setTabIndex(firstError);
    return !Object.keys(next).length;
  };

  const save = async (then: 'stay' | 'close' | 'new') => {
    if (!validate()) {
      notify('alert', 'Fill in the required fields first.');
      return;
    }
    setSaving(true);
    try {
      const payload = await buildPayload(table.logicalName, draft);
      if (isNew) {
        const created = await createRow(table.entitySet, payload);
        const id = created?.[`${table.logicalName}id`];
        notify('success', `${target.label}: record created.`);
        onChanged();
        if (then === 'close' || (then === 'stay' && typeof id !== 'string')) onClose();
        else if (then === 'new') onNew();
        else onNavigate(id as string);
      } else {
        if (Object.keys(payload).length) await updateRow(table.entitySet, target.id as string, payload);
        notify('success', `${target.label}: changes saved.`);
        onChanged();
        if (then === 'close') onClose();
        else if (then === 'new') onNew();
        else {
          setDraft({});
          setReload((count) => count + 1);
        }
      }
    } catch (error) {
      notify('alert', `Save failed: ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const runPending = async () => {
    if (!pending || !target.id) return;
    setBusy(true);
    try {
      if (pending === 'delete') await deleteRow(table.entitySet, target.id);
      else await setRowState(table.entitySet, target.id, pending === 'activate');
      notify('success', `${target.label}: record ${pending === 'delete' ? 'deleted' : pending === 'activate' ? 'activated' : 'deactivated'}.`);
      onChanged();
      if (pending === 'delete') onClose();
      else setReload((count) => count + 1);
    } catch (error) {
      notify('alert', `${pending === 'delete' ? 'Delete' : 'Update'} failed: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const leave = (action: () => void) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    action();
  };

  const errorCount = (tab: (typeof tabs)[number]) => tab.sections.reduce((sum, section) => sum + section.fields.filter((field) => errors[field.name]).length, 0);
  const footerValue = (name: string) => (row && !isNew ? formatCell(row, { name, kind: name.endsWith('on') ? 'date' : 'lookup' }, { truncate: false }) : '');

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) leave(onClose); }}>
      <div className="modal-box detail-modal-box" style={{ maxWidth: 1040, width: '96%' }} role="dialog" aria-modal="true" aria-labelledby="record-title">
        <div className="modal-hdr">
          {backTo && (
            <button type="button" className="back-link" onClick={() => leave(onBack)}>
              <ArrowLeft size={12} color="currentColor" /> Back to {backTo}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="modal-title" id="record-title" dir="auto">
                {isNew ? 'New record' : title || target.label}
                {dirty && <span className="sbadge sbadge-amber" style={{ marginInlineStart: 8 }}>Unsaved changes</span>}
                {!isNew && row && !active && <span className="sbadge sbadge-gray" style={{ marginInlineStart: 8 }}>Inactive</span>}
              </div>
              <div className="modal-sub">
                {target.label}
                {layout && ` · ${layout.name}`}
              </div>
            </div>
            {position >= 0 && siblings.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} aria-label="Record navigation">
                <button type="button" className="btn btn-outline btn-sm" aria-label="Previous record" disabled={position === 0} onClick={() => leave(() => onNavigate(siblings[position - 1]))}>
                  <ArrowUp2 size={13} color="currentColor" />
                </button>
                <span className="req-dim" style={{ fontSize: 11 }}>{position + 1} / {siblings.length}</span>
                <button type="button" className="btn btn-outline btn-sm" aria-label="Next record" disabled={position === siblings.length - 1} onClick={() => leave(() => onNavigate(siblings[position + 1]))}>
                  <ArrowDown2 size={13} color="currentColor" />
                </button>
              </div>
            )}
          </div>
          <div className="filter-bar" style={{ marginTop: 10, marginBottom: 0 }}>
            {canSave && (
              <>
                <button type="button" className="btn btn-primary" disabled={saving || !layout} onClick={() => void save('stay')}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn btn-outline" disabled={saving || !layout} onClick={() => void save('close')}>
                  Save &amp; Close
                </button>
                {canCreate && (
                  <button type="button" className="btn btn-outline" disabled={saving || !layout} onClick={() => void save('new')}>
                    Save &amp; New
                  </button>
                )}
              </>
            )}
            {!canSave && <span className="sbadge sbadge-gray">Read-only: you don’t have permission to {isNew ? 'create' : 'edit'} this record</span>}
            {!isNew && (
              <>
                {canWrite && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setPending(active ? 'deactivate' : 'activate')}>
                    {active ? <CloseCircle size={14} color="currentColor" /> : <TickCircle size={14} color="currentColor" />}
                    {active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="btn btn-outline-danger" disabled={saving} onClick={() => setPending('delete')}>
                    <Trash size={14} color="currentColor" /> Delete
                  </button>
                )}
                {canAssign && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDialog('assign')}>
                    <Profile2User size={14} color="currentColor" /> Assign
                  </button>
                )}
                {canShare && (
                  <button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDialog('share')}>
                    <Share size={14} color="currentColor" /> Share
                  </button>
                )}
                <button type="button" className="btn btn-outline" disabled={saving} onClick={() => leave(() => { setDraft({}); setErrors({}); setReload((count) => count + 1); })}>
                  <Refresh size={14} color="currentColor" /> Refresh
                </button>
              </>
            )}
            <button type="button" className="btn btn-ghost" style={{ marginInlineStart: 'auto' }} onClick={() => leave(onClose)}>
              Close
            </button>
          </div>
          {tabs.length > 1 && (
            <div className="seg-group" role="tablist" aria-label="Form tabs" style={{ marginTop: 12, maxWidth: '100%', overflowX: 'auto' }}>
              {tabs.map((tab, index) => {
                const count = errorCount(tab);
                return (
                  <button key={tab.label + index} type="button" role="tab" aria-selected={tab === activeTab} className={`seg-btn${tab === activeTab ? ' active' : ''}`} onClick={() => setTabIndex(index)}>
                    {tab.label}
                    {count > 0 && <span className="seg-count" style={{ color: 'var(--danger)' }}>{count}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-body">
          {details.loading && (
            <div className="loader-box" role="status">
              <div className="loader-ring" />
              <div className="loader-text">{isNew ? 'Loading form…' : 'Loading record…'}</div>
            </div>
          )}
          {details.error && (
            <div className="empty-state" role="alert">
              <div className="empty-title">Couldn’t load this record</div>
              <div className="empty-sub" dir="auto">{details.error}</div>
            </div>
          )}
          {row &&
            activeTab?.sections.map((section, sectionIndex) => (
              <div key={section.label + sectionIndex} className="ro-card">
                <div className="ro-title">{section.label}</div>
                {section.fields.length > 0 && (
                  <div className="grid2">
                    {section.fields.map((field) => {
                      const meta = metaFor(table.logicalName, field);
                      // Rich text: the form uses the rich editor control, or the stored value is HTML.
                      const rich = field.richText || richTextHtml(row, field) !== null;
                      const updateDraft = (value: DraftValue) => {
                        setDraft((items) => ({ ...items, [field.name]: value }));
                        if (errors[field.name]) setErrors((items) => { const next = { ...items }; delete next[field.name]; return next; });
                      };
                      return (
                        <div key={field.name} className={`form-field${rich || meta.kind === 'memo' ? ' full' : ''}`}>
                          <label className="field-lbl" htmlFor={`f-${field.name}`}>
                            {field.label}
                            {meta.required && !isReadOnly(field, meta) && <span className="field-req"> *</span>}
                          </label>
                          {rich ? (
                            <RichTextField
                              id={`f-${field.name}`}
                              html={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : typeof row[field.name] === 'string' ? (row[field.name] as string) : ''}
                              readOnly={isReadOnly(field, meta)}
                              onChange={updateDraft}
                            />
                          ) : (
                            <FieldEditor
                              id={`f-${field.name}`}
                              meta={meta}
                              readOnly={isReadOnly(field, meta)}
                              row={row}
                              value={field.name in draft ? draft[field.name] : currentValue(row, meta)}
                              resolveTarget={() => lookupTargetTable(table.entitySet, table.logicalName, field.name, row)}
                              onOpenRelated={(related) => leave(() => onOpenRelated(related))}
                              onChange={updateDraft}
                            />
                          )}
                          {errors[field.name] && <div className="field-err">{errors[field.name]}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {section.subgrids.map((subgrid) =>
                  target.id ? (
                    <SubgridView
                      key={subgrid.id}
                      subgrid={subgrid}
                      parentTable={table.logicalName}
                      parentId={target.id}
                      reloadKey={reload}
                      onOpen={(related) => leave(() => onOpenRelated(related))}
                    />
                  ) : (
                    <div key={subgrid.id} className="section-note">{subgrid.label}: save the record first to add related records.</div>
                  ),
                )}
              </div>
            ))}
          {row && !isNew && (
            // Model-driven form footer: ownership and audit stamps.
            <div className="kv-grid ro-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 16px' }}>
              {[
                ['Owner', footerValue('ownerid')],
                ['Status', formatCell(row, { name: 'statecode', kind: 'choice' })],
                ['Created By', footerValue('createdby')],
                ['Created On', footerValue('createdon')],
                ['Modified By', footerValue('modifiedby')],
                ['Modified On', footerValue('modifiedon')],
              ].map(([label, value]) => (
                <div key={label} className="kv-item">
                  <span className="k">{label}</span>
                  <span className="v" dir="auto">{value || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {pending && (
        <ConfirmDialog
          title={pending === 'delete' ? 'Confirm Deletion' : pending === 'activate' ? 'Confirm Activation' : 'Confirm Deactivation'}
          message={pending === 'delete' ? "Do you want to permanently delete this record? You can't undo this action." : `Do you want to ${pending} this record?`}
          confirmLabel={pending === 'delete' ? 'Delete' : pending === 'activate' ? 'Activate' : 'Deactivate'}
          danger={pending !== 'activate'}
          busy={busy}
          onConfirm={() => void runPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {dialog === 'assign' && target.id && (
        <AssignDialog table={table} ids={[target.id]} notify={notify} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged(); setReload((count) => count + 1); }} />
      )}
      {dialog === 'share' && target.id && (
        <ShareDialog table={table} ids={[target.id]} notify={notify} onClose={() => setDialog(null)} onDone={() => setDialog(null)} />
      )}
    </div>
  );
}
````

### `src/screens/ColumnPicker.tsx`

````tsx
import { useState } from 'react';
import { ArrowDown2, ArrowUp2, CloseCircle, SearchNormal1 } from 'iconsax-react';
import type { GridColumn } from '../data/views';

interface ColumnPickerProps {
  /** Columns shown now, in order. */
  current: readonly GridColumn[];
  /** Every column the table offers (view columns + table attributes). */
  available: readonly GridColumn[];
  /** True when the grid currently uses a saved custom set instead of the view's columns. */
  customized: boolean;
  onApply: (names: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}

/** "Edit columns" dialog: add, remove and reorder grid columns for one view. */
export function ColumnPicker({ current, available, customized, onApply, onReset, onClose }: ColumnPickerProps) {
  const [selected, setSelected] = useState<string[]>(() => current.map((column) => column.name));
  const [query, setQuery] = useState('');

  const byName = new Map<string, GridColumn>([...available, ...current].map((column) => [column.name, column]));
  // Spaces ignored, so "doctor key" finds "DoctorKey" and vice versa.
  const compact = (text: string) => text.toLowerCase().replace(/\s+/g, '');
  const search = compact(query);
  const addable = available.filter(
    (column) =>
      !selected.includes(column.name) &&
      (!search || compact(column.label).includes(search) || column.name.toLowerCase().includes(search)),
  );

  const move = (index: number, delta: number) =>
    setSelected((names) => {
      const next = [...names];
      const [name] = next.splice(index, 1);
      next.splice(index + delta, 0, name);
      return next;
    });

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-box detail-modal-box" role="dialog" aria-modal="true" aria-labelledby="column-picker-title">
        <div className="modal-hdr">
          <div className="modal-title" id="column-picker-title">Edit columns</div>
          <div className="modal-sub">Choose which columns this view shows. Saved in this browser only.</div>
        </div>
        <div className="modal-body">
          <div className="sub-hdr">Shown ({selected.length})</div>
          {selected.map((name, index) => (
            <div key={name} className="attach-row">
              <span style={{ flex: 1, minWidth: 0 }}>{byName.get(name)?.label ?? name}</span>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp2 size={12} color="currentColor" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Move down" disabled={index === selected.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown2 size={12} color="currentColor" />
              </button>
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                aria-label={`Remove ${byName.get(name)?.label ?? name}`}
                disabled={selected.length === 1}
                onClick={() => setSelected((names) => names.filter((item) => item !== name))}
              >
                <CloseCircle size={12} color="currentColor" />
              </button>
            </div>
          ))}

          <div className="sub-hdr">Add columns</div>
          <div className="form-field">
            <div className="search-select">
              <span className="ss-icon">
                <SearchNormal1 size={12} color="currentColor" />
              </span>
              <input
                className="field-input"
                placeholder="Search columns…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search columns"
              />
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
            {addable.map((column) => (
              <div
                key={column.name}
                className="ss-row"
                role="button"
                tabIndex={0}
                onClick={() => setSelected((names) => [...names, column.name])}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected((names) => [...names, column.name]);
                  }
                }}
              >
                + {column.label}
              </div>
            ))}
            {!addable.length && <div className="ss-empty">No more columns match.</div>}
          </div>

          <div className="modal-btn-row">
            <button type="button" className="btn btn-primary" onClick={() => onApply(selected)}>
              Apply
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
          </div>
          {customized && (
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onReset}>
              Reset to view default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
````

### `src/screens/Dropdown.tsx`

````tsx
import { useCallback, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { SearchNormal1, TickSquare } from 'iconsax-react';
import { useDismiss } from './useDismiss';

/**
 * Single-choice dropdown styled like the Doctors "Business Unit" picker — replaces native
 * <select>s so every list in the app looks the same. Long lists get a search box; groups render
 * as headers (e.g. My Views / System Views). Keyboard: ↑/↓, Home/End, Enter, Esc, type to search.
 */

export interface DropdownOption {
  value: string;
  label: string;
  /** Group header shown above the first option of each group (options must be ordered by group). */
  group?: string;
}

interface DropdownProps {
  value: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  /** Shown when no option matches `value`. */
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  style?: CSSProperties;
  /** Show the search box (default: when there are more than 8 options). */
  searchable?: boolean;
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

export function Dropdown({ value, options, onChange, placeholder = 'Select…', id, ariaLabel, disabled, style, searchable }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const showSearch = searchable ?? options.length > 8;

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  useDismiss(rootRef, open, close);

  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => {
    const term = normalize(query);
    return term ? options.filter((option) => normalize(option.label).includes(term)) : options;
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(0, index));
    setOpen(true);
    // Scroll the chosen option into view once the menu has rendered.
    window.requestAnimationFrame(() => listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  };

  const choose = (option: DropdownOption) => {
    onChange(option.value);
    close();
    buttonRef.current?.focus();
  };

  const move = (next: number) => {
    const index = Math.min(Math.max(next, 0), visible.length - 1);
    setActive(index);
    listRef.current?.querySelectorAll('[role="option"]')[index]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(active + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(active - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(visible.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (visible[active]) choose(visible[active]);
        break;
      case 'Tab':
        close();
        break;
      default:
        break;
    }
  };

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={rootRef} style={style} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="field-input dd-btn"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className={`dd-value${selected ? '' : ' placeholder'}`} dir="auto">{selected?.label ?? placeholder}</span>
        <span className="dd-arrow" aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="dd-menu">
          {showSearch && (
            <div className="dd-search">
              <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
              <input
                autoFocus
                dir="auto"
                value={query}
                placeholder="Search…"
                aria-label="Search options"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
              />
            </div>
          )}
          <div className="dd-list" role="listbox" id={listId} ref={listRef} aria-label={ariaLabel}>
            {visible.length === 0 && <div className="dd-empty">No matches</div>}
            {visible.map((option, index) => {
              const header = option.group && option.group !== visible[index - 1]?.group ? option.group : null;
              const isSelected = option.value === value;
              return (
                <div key={`${option.group ?? ''}:${option.value}`}>
                  {header && <div className="dd-group">{header}</div>}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    className={`dd-opt${isSelected ? ' selected' : ''}${index === active ? ' active' : ''}`}
                    dir="auto"
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <span className="dd-opt-label">{option.label}</span>
                    {isSelected && <TickSquare size={15} color="currentColor" variant="Bold" aria-hidden="true" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
````

### `src/screens/useDismiss.ts`

````ts
import { useEffect, type RefObject } from 'react';

/**
 * Closes a popup menu on a click outside `ref` or on Escape. Used instead of mouse-leave, which
 * closed menus while the pointer crossed the small gap between a button and its menu.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, open, onClose]);
}
````

### `src/screens/grid/ViewGrid.tsx`

````tsx
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
````

### `src/screens/grid/ColumnMenu.tsx`

````tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Filter, FilterRemove, Maximize3, Sort, TickSquare } from 'iconsax-react';
import type { GridColumn } from '../../data/views';

export interface ColumnMenuAnchor {
  column: GridColumn;
  /** Viewport position of the header cell (menu is fixed-positioned so the grid's scroll box can't clip it). */
  left: number;
  top: number;
}

interface ColumnMenuProps {
  anchor: ColumnMenuAnchor;
  sortedDescending: boolean | null;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  width: number;
  onSort: (descending: boolean) => void;
  onFilter: () => void;
  /** The column has a filter in effect (shows "Clear filter"). */
  filtered: boolean;
  /** The user sorted by this column (shows "Clear sort", back to the view's own sort). */
  customSorted: boolean;
  onClearSort: () => void;
  onClearFilter: () => void;
  onWidth: (width: number) => void;
  onMove: (delta: -1 | 1) => void;
  onClose: () => void;
}

const rowStyle = { display: 'flex', alignItems: 'center', gap: 8 } as const;

/** Model-driven column header menu: A to Z, Z to A, Filter by, Clear filter, Column width, Move left/right. */
export function ColumnMenu({ anchor, sortedDescending, canMoveLeft, canMoveRight, width, onSort, onFilter, filtered, onClearFilter, customSorted, onClearSort, onWidth, onMove, onClose }: ColumnMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [editingWidth, setEditingWidth] = useState(false);
  const [widthDraft, setWidthDraft] = useState(String(width));
  // Linked-table columns sort and filter too (through their link), beyond the model-driven grid.
  const sortable = true;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const item = (label: string, icon: ReactNode, action: () => void, options: { disabled?: boolean; checked?: boolean } = {}) => (
    <div
      className="ss-row"
      role="menuitem"
      tabIndex={options.disabled ? -1 : 0}
      aria-disabled={options.disabled || undefined}
      style={{ ...rowStyle, opacity: options.disabled ? 0.45 : 1, cursor: options.disabled ? 'not-allowed' : 'pointer' }}
      onClick={options.disabled ? undefined : action}
      onKeyDown={(event) => {
        if (!options.disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          action();
        }
      }}
    >
      <span style={{ width: 14, display: 'inline-flex' }}>{options.checked ? <TickSquare size={14} color="currentColor" variant="Bold" /> : null}</span>
      {icon}
      {label}
    </div>
  );

  return (
    <div
      ref={menuRef}
      className="ss-list open"
      role="menu"
      aria-label={`${anchor.column.label} column`}
      style={{ position: 'fixed', left: anchor.left, top: anchor.top, right: 'auto', width: 220, maxHeight: 'none', zIndex: 400 }}
    >
      {item('A to Z', <ArrowUp size={14} color="currentColor" />, () => onSort(false), { disabled: !sortable, checked: sortedDescending === false })}
      {item('Z to A', <ArrowDown size={14} color="currentColor" />, () => onSort(true), { disabled: !sortable, checked: sortedDescending === true })}
      {customSorted && item('Clear sort', <Sort size={14} color="currentColor" />, onClearSort)}
      {item('Filter by', <Filter size={14} color="currentColor" />, onFilter, { disabled: !sortable })}
      {filtered && item('Clear filter', <FilterRemove size={14} color="currentColor" />, onClearFilter)}
      {editingWidth ? (
        <div className="ss-row" style={rowStyle}>
          <input
            className="field-input"
            type="number"
            min={40}
            max={800}
            value={widthDraft}
            autoFocus
            aria-label="Column width in pixels"
            onChange={(event) => setWidthDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onWidth(Number(widthDraft));
            }}
            style={{ padding: '5px 8px' }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onWidth(Number(widthDraft))}>
            Set
          </button>
        </div>
      ) : (
        item('Column width', <Maximize3 size={14} color="currentColor" />, () => setEditingWidth(true))
      )}
      {item('Move left', <ArrowLeft size={14} color="currentColor" />, () => onMove(-1), { disabled: !canMoveLeft })}
      {item('Move right', <ArrowRight size={14} color="currentColor" />, () => onMove(1), { disabled: !canMoveRight })}
    </div>
  );
}
````

### `src/screens/grid/ColumnFilterPopover.tsx`

````tsx
import { useCallback, useRef, useState } from 'react';
import { columnMeta } from '../../data/columnMeta';
import { newNodeId, NO_VALUE_OPERATORS, operatorsFor, type FilterCondition } from '../../data/fetchQuery';
import type { GridColumn } from '../../data/views';
import { Dropdown } from '../Dropdown';
import { useDismiss } from '../useDismiss';
import { ValueEditor } from './FilterEditor';

interface ColumnFilterPopoverProps {
  tableLogicalName: string;
  tableEntitySet: string;
  column: GridColumn;
  /** Viewport-derived position under the header cell (CSS px of the zoomed content). */
  left: number;
  top: number;
  /** The column's filter in effect, if any. */
  current: FilterCondition | undefined;
  onApply: (condition: FilterCondition) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Model-driven "Filter by" callout under a column header: operator + value, Apply / Clear.
 * Column filters are ANDed with the view's filter, like the MDA grid.
 */
export function ColumnFilterPopover({ tableLogicalName, tableEntitySet, column, left, top, current, onApply, onClear, onClose }: ColumnFilterPopoverProps) {
  // A linked-table column takes its kind and options from that table.
  const linkedMeta = column.linked && column.entity ? columnMeta(column.entity, column.name.slice(column.name.indexOf('.') + 1)) : undefined;
  const meta = column.linked ? linkedMeta : columnMeta(tableLogicalName, column.name);
  // Lookup values of a linked table can't be picked here (the picker works on this table): only "contains data".
  const linkedLookup = column.linked && meta?.kind === 'lookup';
  const allOperators = operatorsFor(meta?.kind ?? 'text', meta?.multiSelect ?? false);
  const operators = linkedLookup ? allOperators.filter((option) => option.value === 'not-null' || option.value === 'null') : allOperators;
  // Like the MDA: text/lookups "Contains", choices pick values from a list, dates "On".
  const kind = meta?.kind ?? 'text';
  const defaultOperator =
    kind === 'choice' ? (meta?.multiSelect ? 'contain-values' : 'in') : kind === 'date' ? 'on' : kind === 'number' || kind === 'lookup' ? 'eq' : 'like';
  const [draft, setDraft] = useState<FilterCondition>(
    () =>
      current ?? {
        kind: 'condition',
        id: newNodeId(),
        attribute: column.name,
        operator: operators.some((option) => option.value === defaultOperator) ? defaultOperator : (operators[0]?.value ?? 'eq'),
        values: [],
      },
  );
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, true, close);

  const needsValue = !NO_VALUE_OPERATORS.has(draft.operator);
  const canApply = !needsValue || draft.values.some((value) => value.trim() !== '');

  return (
    <div ref={ref} className="col-filter" role="dialog" aria-label={`Filter by ${column.label}`} style={{ left, top }}>
      <div className="col-filter-title">Filter by</div>
      <Dropdown
        ariaLabel="Operator"
        value={draft.operator}
        options={operators}
        onChange={(operator) => setDraft((prev) => ({ ...prev, operator, values: NO_VALUE_OPERATORS.has(operator) || kind === 'lookup' ? [] : prev.values, uiNames: undefined }))}
      />
      {needsValue && (
        <div className="col-filter-value">
          <ValueEditor
            condition={draft}
            meta={meta}
            readOnly={false}
            table={{ logicalName: tableLogicalName, entitySet: tableEntitySet }}
            onChange={(values, lookup) => setDraft((prev) => ({ ...prev, values, uiName: undefined, uiNames: lookup?.names, uiType: lookup?.table }))}
          />
        </div>
      )}
      <div className="col-filter-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={() => onApply(draft)}>
          Apply
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
````

### `src/screens/grid/FilterEditor.tsx`

````tsx
import { Dropdown } from '../Dropdown';
import { LookupValuesPicker } from './LookupValuesPicker';
import { useState } from 'react';
import { Add, Trash } from 'iconsax-react';
import { columnMeta, type ColumnMeta } from '../../data/columnMeta';
import {
  MULTI_VALUE_OPERATORS,
  NO_VALUE_OPERATORS,
  displayValue,
  emptyGroup,
  newNodeId,
  operatorsFor,
  storedValue,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
} from '../../data/fetchQuery';

export interface FilterField {
  name: string;
  label: string;
}

interface FilterEditorProps {
  tableLabel: string;
  tableLogicalName: string;
  tableEntitySet: string;
  /** Fields that can be filtered (base-table attributes). */
  fields: readonly FilterField[];
  /** Filter currently applied (the view's own filter until the user changes it). */
  current: FilterGroup;
  /** The view's original filter, for "Reset to default". */
  viewDefault: FilterGroup;
  onApply: (filter: FilterGroup) => void;
  onClose: () => void;
}

const clone = (group: FilterGroup): FilterGroup => JSON.parse(JSON.stringify(group)) as FilterGroup;

const newCondition = (attribute = ''): FilterCondition => ({ kind: 'condition', id: newNodeId(), attribute, operator: 'eq', values: [] });

/** Replace/remove a node anywhere in the tree (immutably). */
function mapTree(group: FilterGroup, id: string, change: (node: FilterNode) => FilterNode | null): FilterGroup {
  const items: FilterNode[] = [];
  for (const item of group.items) {
    if (item.id === id) {
      const next = change(item);
      if (next) items.push(next);
    } else items.push(item.kind === 'group' ? mapTree(item, id, change) : item);
  }
  return { ...group, items };
}

/**
 * "Edit filters" — the model-driven AND/OR filter editor over the view's own conditions.
 * Starts from the filter in effect; Apply replaces the view's root filter for this session.
 */
export function FilterEditor({ tableLabel, tableLogicalName, tableEntitySet, fields, current, viewDefault, onApply, onClose }: FilterEditorProps) {
  const [draft, setDraft] = useState<FilterGroup>(() => clone(current));

  const update = (id: string, change: (node: FilterNode) => FilterNode | null) =>
    setDraft((root) => (root.id === id ? ((change(root) as FilterGroup | null) ?? emptyGroup()) : mapTree(root, id, change)));

  const fieldLabel = (name: string) => fields.find((field) => field.name === name)?.label ?? columnMeta(tableLogicalName, name)?.label ?? name;

  const renderCondition = (condition: FilterCondition) => {
    const meta: ColumnMeta | undefined = condition.attribute.includes('.') ? undefined : columnMeta(tableLogicalName, condition.attribute);
    const kind = meta?.kind ?? 'text';
    const operators = operatorsFor(kind, meta?.multiSelect ?? false);
    const knownOperator = operators.some((option) => option.value === condition.operator);
    const readOnlyRow = condition.attribute.includes('.');
    return (
      <div key={condition.id} className="attach-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(140px,1.1fr) minmax(140px,1fr) minmax(160px,1.3fr) auto', gap: 8, alignItems: 'center' }}>
        <Dropdown
          ariaLabel="Field"
          value={condition.attribute}
          disabled={readOnlyRow}
          placeholder="Select a field"
          options={[
            ...(readOnlyRow || (condition.attribute && !fields.some((field) => field.name === condition.attribute)) ? [{ value: condition.attribute, label: readOnlyRow ? condition.attribute : fieldLabel(condition.attribute) }] : []),
            ...fields.map((field) => ({ value: field.name, label: field.label })),
          ]}
          onChange={(attribute) => update(condition.id, () => ({ ...newCondition(attribute), id: condition.id }))}
        />
        <Dropdown
          ariaLabel="Operator"
          value={condition.operator}
          disabled={readOnlyRow || !condition.attribute}
          options={[...(knownOperator ? [] : [{ value: condition.operator, label: condition.operator }]), ...operators]}
          onChange={(operator) =>
            update(condition.id, (node) => ({ ...(node as FilterCondition), operator, values: NO_VALUE_OPERATORS.has(operator) || kind === 'lookup' ? [] : (node as FilterCondition).values.slice(0, MULTI_VALUE_OPERATORS.has(operator) ? undefined : 1), uiName: undefined, uiNames: undefined }))
          }
        />
        <ValueEditor
          condition={condition}
          meta={meta}
          readOnly={readOnlyRow}
          table={{ logicalName: tableLogicalName, entitySet: tableEntitySet }}
          onChange={(values, lookup) => update(condition.id, (node) => ({ ...(node as FilterCondition), values, uiName: undefined, uiNames: lookup?.names, uiType: lookup?.table }))}
        />
        <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete condition" onClick={() => update(condition.id, () => null)}>
          <Trash size={13} color="currentColor" />
        </button>
      </div>
    );
  };

  const renderGroup = (group: FilterGroup, depth: number) => (
    <div
      key={group.id}
      style={depth ? { borderInlineStart: '2px solid var(--gold-light)', paddingInlineStart: 12, margin: '6px 0 10px', background: 'var(--brand-gold-100)', borderRadius: 'var(--r-md)', padding: 10 } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Dropdown
          ariaLabel="Group operator"
          value={group.type}
          style={{ width: 110 }}
          options={[
            { value: 'and', label: 'And' },
            { value: 'or', label: 'Or' },
          ]}
          onChange={(type) => update(group.id, (node) => ({ ...(node as FilterGroup), type: type === 'or' ? 'or' : 'and' }))}
        />
        {depth > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete group" onClick={() => update(group.id, () => null)}>
            <Trash size={13} color="currentColor" />
          </button>
        )}
      </div>
      {group.items.map((item) => (item.kind === 'group' ? renderGroup(item, depth + 1) : renderCondition(item)))}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => update(group.id, (node) => ({ ...(node as FilterGroup), items: [...(node as FilterGroup).items, newCondition()] }))}>
          <Add size={13} color="currentColor" /> Add row
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => update(group.id, (node) => ({ ...(node as FilterGroup), items: [...(node as FilterGroup).items, { ...emptyGroup('or'), items: [newCondition()] }] }))}>
          <Add size={13} color="currentColor" /> Add group
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay side-panel-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-box side-panel" role="dialog" aria-modal="true" aria-labelledby="filter-editor-title">
        <div className="modal-hdr">
          <div className="modal-title" id="filter-editor-title">Edit filters: {tableLabel}</div>
          <div className="filter-bar" style={{ marginTop: 8, marginBottom: 0 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(clone(viewDefault))}>
              Reset to default
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(emptyGroup())}>
              Delete all filters
            </button>
          </div>
        </div>
        <div className="modal-body">
          {renderGroup(draft, 0)}
          <div className="modal-btn-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => onApply(draft)}>
              Apply
            </button>
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Value change from the editor; lookups also report the picked records' names and table. */
export type ValueChange = (values: string[], lookup?: { names: string[]; table: string | undefined }) => void;

export function ValueEditor({
  condition,
  meta,
  readOnly,
  table,
  onChange,
}: {
  condition: FilterCondition;
  meta: ColumnMeta | undefined;
  readOnly: boolean;
  /** The grid's table — needed to search the records of a lookup column. */
  table: { logicalName: string; entitySet: string };
  onChange: ValueChange;
}) {
  const { operator } = condition;
  if (NO_VALUE_OPERATORS.has(operator)) return <span className="req-dim">—</span>;
  if (readOnly) return <span className="req-dim">{condition.uiName ?? condition.values.join(', ')}</span>;

  // Lookup Equals / Does not equal: pick one or more records by name (model-driven behaviour).
  if (meta?.kind === 'lookup' && (operator === 'eq' || operator === 'ne')) {
    const names = condition.uiNames ?? (condition.uiName ? [condition.uiName] : []);
    return (
      <LookupValuesPicker
        tableEntitySet={table.entitySet}
        tableLogicalName={table.logicalName}
        attribute={condition.attribute}
        values={condition.values}
        names={condition.values.map((_, index) => names[index] ?? '')}
        onChange={(values, picked, target) => onChange(values, { names: picked, table: target })}
      />
    );
  }

  if (meta?.kind === 'choice' && meta.options.length) {
    if (MULTI_VALUE_OPERATORS.has(operator)) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {meta.options.map((option) => {
            const checked = condition.values.includes(String(option.value));
            return (
              <label key={option.value} className="sbadge sbadge-gray" style={{ cursor: 'pointer', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange(checked ? condition.values.filter((value) => value !== String(option.value)) : [...condition.values, String(option.value)])}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }
    return (
      <Dropdown
        ariaLabel="Value"
        value={condition.values[0] ?? ''}
        placeholder="Select a value"
        options={meta.options.map((option) => ({ value: String(option.value), label: option.label }))}
        onChange={(value) => onChange([value])}
      />
    );
  }

  if (meta?.kind === 'date' && operator !== 'last-x-days' && operator !== 'next-x-days') {
    return <input className="field-input" type="date" aria-label="Value" value={(condition.values[0] ?? '').slice(0, 10)} onChange={(event) => onChange([event.target.value])} />;
  }

  const numeric = meta?.kind === 'number' || operator === 'last-x-days' || operator === 'next-x-days';
  return (
    <input
      className="field-input"
      type={numeric ? 'number' : 'text'}
      aria-label="Value"
      dir="auto"
      value={displayValue(operator, condition.values[0] ?? '')}
      onChange={(event) => onChange([storedValue(operator, event.target.value)])}
    />
  );
}
````

### `src/screens/grid/LookupValuesPicker.tsx`

````tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseCircle, SearchNormal1 } from 'iconsax-react';
import { lookupTableInfo, lookupTargetTable, searchLookup, type LookupOption } from '../../data/lookups';
import { useDismiss } from '../useDismiss';

interface LookupValuesPickerProps {
  tableEntitySet: string;
  tableLogicalName: string;
  attribute: string;
  /** Selected record ids with their names (same order). */
  values: string[];
  names: string[];
  onChange: (values: string[], names: string[], targetTable: string | undefined) => void;
}

/**
 * Model-driven lookup filter value: search the lookup's table by name and pick one or more
 * records (shown as removable chips). The condition then matches those exact records.
 */
export function LookupValuesPicker({ tableEntitySet, tableLogicalName, attribute, values, names, onChange }: LookupValuesPickerProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ key: string; options: LookupOption[] } | null>(null);
  const [target, setTarget] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  // Search (debounced) whenever the menu is open and the text changes.
  const searchKey = open ? text.trim() : null;
  useEffect(() => {
    if (searchKey === null) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const targetTable = await lookupTargetTable(tableEntitySet, tableLogicalName, attribute);
        const info = targetTable ? await lookupTableInfo(targetTable) : null;
        if (!info) {
          if (!cancelled) setError('Couldn’t find the related table for this column.');
          return;
        }
        const options = await searchLookup(info, searchKey);
        if (!cancelled) {
          setTarget(info.logicalName);
          setError('');
          setResults({ key: searchKey, options });
        }
      } catch {
        if (!cancelled) setError('Search failed. Try again.');
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchKey, tableEntitySet, tableLogicalName, attribute]);

  const loading = open && searchKey !== null && results?.key !== searchKey && !error;
  const toggle = (option: LookupOption) => {
    const index = values.indexOf(option.id);
    if (index >= 0) onChange(values.filter((_, i) => i !== index), names.filter((_, i) => i !== index), target);
    else onChange([...values, option.id], [...names, option.name], target);
  };

  return (
    <div className="dd lookup-pick" ref={ref}>
      {values.length > 0 && (
        <div className="lookup-pick-chips">
          {values.map((id, index) => (
            <span key={id} className="lookup-chip" dir="auto">
              {names[index] || id}
              <button type="button" aria-label={`Remove ${names[index] || id}`} onClick={() => onChange(values.filter((_, i) => i !== index), names.filter((_, i) => i !== index), target)}>
                <CloseCircle size={14} color="currentColor" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="lookup-pick-search">
        <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
        <input
          className="field-input"
          dir="auto"
          value={text}
          placeholder="Search records…"
          aria-label="Search records"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <div className="dd-menu dd-list" role="listbox" aria-multiselectable="true">
          {error ? (
            <div className="dd-empty">{error}</div>
          ) : loading ? (
            <div className="dd-empty">Searching…</div>
          ) : results && results.options.length === 0 ? (
            <div className="dd-empty">No records found</div>
          ) : (
            results?.options.map((option) => {
              const selected = values.includes(option.id);
              return (
                <label key={option.id} className={`dd-opt dd-check${selected ? ' selected' : ''}`} dir="auto">
                  <input type="checkbox" checked={selected} onChange={() => toggle(option)} />
                  <span>
                    {option.name || option.id}
                    {option.detail && <span className="ss-row-detail">{option.detail}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
````

### `src/screens/grid/BulkEditDialog.tsx`

````tsx
import { useState } from 'react';
import type { TableRef } from '../../app/navigation';
import { errorMessage, updateRow } from '../../data/dataverse';
import { formFields, loadMainForm } from '../../data/forms';
import { lookupTargetTable } from '../../data/lookups';
import { useAsyncData } from '../../data/useAsyncData';
import { FieldEditor, type DraftValue } from '../form/FieldEditor';
import { RichTextField } from '../form/RichTextField';
import { SYSTEM_READ_ONLY, buildPayload, metaFor } from '../form/values';

interface BulkEditDialogProps {
  table: TableRef;
  label: string;
  ids: readonly string[];
  notify: (kind: 'success' | 'alert', text: string) => void;
  onDone: () => void;
  onClose: () => void;
}

/**
 * "Edit multiple records": the main form's editable fields start empty; only the fields the user
 * changes are written to every selected record — the same rule as the model-driven bulk edit.
 */
export function BulkEditDialog({ table, label, ids, notify, onDone, onClose }: BulkEditDialogProps) {
  const layout = useAsyncData(`bulk#${table.logicalName}`, () => loadMainForm(table.logicalName));
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [busy, setBusy] = useState(false);

  const fields = (layout.data ? formFields(layout.data) : []).filter((field) => {
    const meta = metaFor(table.logicalName, field);
    return !meta.readOnly && !SYSTEM_READ_ONLY.has(field.name) && !(meta.kind === 'lookup' && !meta.navigationProperty);
  });
  const changed = Object.keys(draft).length;

  const apply = async () => {
    setBusy(true);
    let done = 0;
    const failures: string[] = [];
    try {
      const payload = await buildPayload(table.logicalName, draft);
      for (const id of ids) {
        try {
          await updateRow(table.entitySet, id, payload);
          done += 1;
        } catch (error) {
          failures.push(errorMessage(error));
        }
      }
    } catch (error) {
      failures.push(errorMessage(error));
    }
    setBusy(false);
    if (done) notify('success', `Updated ${done} record${done === 1 ? '' : 's'}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };

  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box detail-modal-box" style={{ maxWidth: 860, width: '96%' }} role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
        <div className="modal-hdr">
          <div className="modal-title" id="bulk-edit-title">Edit {ids.length} records</div>
          <div className="modal-sub">{label} · only the fields you change are updated on all selected records.</div>
        </div>
        <div className="modal-body">
          {layout.loading && <div className="loader-text">Loading form…</div>}
          {layout.error && <div className="section-note" dir="auto">{layout.error}</div>}
          {fields.length > 0 && (
            <div className="grid2">
              {fields.map((field) => {
                const meta = metaFor(table.logicalName, field);
                const edited = field.name in draft;
                return (
                  <div key={field.name} className={`form-field${meta.kind === 'memo' ? ' full' : ''}`}>
                    <label className="field-lbl" htmlFor={`b-${field.name}`}>
                      {field.label}
                      {edited && <span className="sbadge sbadge-gold" style={{ marginInlineStart: 6 }}>changed</span>}
                    </label>
                    {field.richText ? (
                      <RichTextField
                        id={`b-${field.name}`}
                        html={typeof draft[field.name] === 'string' ? (draft[field.name] as string) : ''}
                        readOnly={false}
                        onChange={(value) => setDraft((items) => ({ ...items, [field.name]: value }))}
                      />
                    ) : (
                    <FieldEditor
                      id={`b-${field.name}`}
                      meta={meta}
                      readOnly={false}
                      row={{}}
                      value={edited ? draft[field.name] : meta.multiSelect ? [] : meta.kind === 'lookup' ? null : ''}
                      resolveTarget={() => lookupTargetTable(table.entitySet, table.logicalName, field.name)}
                      onOpenRelated={() => undefined}
                      onChange={(value) => setDraft((items) => ({ ...items, [field.name]: value }))}
                    />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="modal-btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-primary" disabled={!changed || busy} onClick={() => void apply()}>
              {busy ? 'Saving…' : `Change ${changed} field${changed === 1 ? '' : 's'} on ${ids.length} records`}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
````

### `src/screens/grid/ConfirmDialog.tsx`

````tsx
interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation before destructive or bulk actions (Delete, Deactivate), like the model-driven prompt. */
export function ConfirmDialog({ title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}>
      <div className="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="modal-hdr">
          <div className="modal-title" id="confirm-title">{title}</div>
          <div className="modal-sub" id="confirm-message">{message}</div>
        </div>
        <div className="modal-body">
          <div className="modal-btn-row">
            <button type="button" className={`btn ${danger ? 'btn-outline-danger' : 'btn-primary'}`} style={{ flex: 1 }} disabled={busy} onClick={onConfirm}>
              {busy ? 'Working…' : confirmLabel}
            </button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
````

### `src/screens/grid/SaveViewDialog.tsx`

````tsx
import { useState } from 'react';

interface SaveViewDialogProps {
  defaultName: string;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

/** "Save as new view": name the personal view that keeps the current columns, filters and sort. */
export function SaveViewDialog({ defaultName, busy, onSave, onCancel }: SaveViewDialogProps) {
  const [name, setName] = useState(defaultName);
  const trimmed = name.trim();
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" role="dialog" aria-modal="true" aria-labelledby="save-view-title">
        <div className="modal-hdr">
          <div className="modal-title" id="save-view-title">Save as new view</div>
          <div className="modal-sub">Saves the current columns, filters and sort to My Views.</div>
        </div>
        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onSave(trimmed);
          }}
        >
          <div className="form-field">
            <label className="field-lbl" htmlFor="view-name">Name <span className="field-req">*</span></label>
            <input id="view-name" className="field-input" value={name} maxLength={200} autoFocus dir="auto" onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="modal-btn-row">
            <button type="submit" className="btn btn-primary" disabled={!trimmed || busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
````

### `src/screens/grid/useToasts.tsx`

````tsx
import { useCallback, useRef, useState } from 'react';

export interface Toast {
  id: number;
  kind: 'success' | 'alert';
  text: string;
}

const TOAST_MS = 5000;

/** Short success / error notices (base.css .toast-rack), auto-dismissed. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((items) => items.filter((toast) => toast.id !== id)), []);

  const notify = useCallback(
    (kind: Toast['kind'], text: string) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((items) => [...items, { id, kind, text }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const rack = toasts.length ? (
    <div className="toast-rack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} onClick={() => dismiss(toast.id)} dir="auto">
          {toast.text}
        </div>
      ))}
    </div>
  ) : null;

  return { notify, rack };
}
````

### `src/screens/form/FieldEditor.tsx`

````tsx
import { useState } from 'react';
import { SearchNormal1 } from 'iconsax-react';
import { findTable } from '../../app/navigation';
import { onFileLinkClick } from '../../data/fileLinks';
import type { ColumnMeta } from '../../data/columnMeta';
import type { DataverseRow } from '../../data/dataverse';
import { errorMessage } from '../../data/dataverse';
import { cellLink, formatCell } from '../../data/formatCell';
import { lookupTableInfo, searchLookup, type LookupOption } from '../../data/lookups';
import type { FormTarget } from '../RecordForm';
import { Dropdown } from '../Dropdown';

export interface LookupValue {
  id: string;
  name: string;
  /** Logical name of the referenced table. */
  table: string;
}

/** Editor state of one field: text/number/date/choice as string, multi-select as string[], lookup as LookupValue. */
export type DraftValue = string | string[] | LookupValue | null;

interface FieldEditorProps {
  id: string;
  meta: ColumnMeta;
  readOnly: boolean;
  row: DataverseRow;
  value: DraftValue;
  resolveTarget: () => Promise<string | null>;
  onOpenRelated: (target: FormTarget) => void;
  onChange: (value: DraftValue) => void;
}

const linkStyle = { color: 'var(--gold-dark)', textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' } as const;

/** One form input, chosen by the column's Dataverse type (like the model-driven form controls). */
export function FieldEditor({ id, meta, readOnly, row, value, resolveTarget, onOpenRelated, onChange }: FieldEditorProps) {
  if (meta.kind === 'lookup') {
    return <LookupEditor id={id} meta={meta} readOnly={readOnly} value={value as LookupValue | null} resolveTarget={resolveTarget} onOpenRelated={onOpenRelated} onChange={onChange} />;
  }

  if (readOnly) {
    const text = formatCell(row, meta, { truncate: false });
    const url = cellLink(row, meta);
    return (
      <div className="field-input" style={{ background: 'var(--neutral-200)', color: 'var(--text-body)', minHeight: 36, whiteSpace: 'pre-wrap' }} dir="auto">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(event) => onFileLinkClick(event, url, text)}>{text}</a> : text || '—'}
      </div>
    );
  }

  if (meta.kind === 'choice' && meta.multiSelect) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="group" aria-labelledby={id}>
        {meta.options.map((option) => {
          const checked = selected.includes(String(option.value));
          return (
            <label key={option.value} className="sbadge sbadge-gray" style={{ cursor: 'pointer', gap: 4 }}>
              <input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== String(option.value)) : [...selected, String(option.value)])} />
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  if (meta.kind === 'choice') {
    return (
      <Dropdown
        id={id}
        value={typeof value === 'string' ? value : ''}
        options={[{ value: '', label: '--Select--' }, ...meta.options.map((option) => ({ value: String(option.value), label: option.label }))]}
        onChange={onChange}
      />
    );
  }

  const text = typeof value === 'string' ? value : '';
  if (meta.kind === 'memo') {
    return <textarea id={id} className="field-input" rows={4} maxLength={meta.maxLength} dir="auto" value={text} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <input
      id={id}
      className="field-input"
      type={meta.kind === 'number' ? 'number' : meta.kind === 'date' ? 'date' : 'text'}
      maxLength={meta.kind === 'text' ? meta.maxLength : undefined}
      dir="auto"
      value={text}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

interface LookupEditorProps {
  id: string;
  meta: ColumnMeta;
  readOnly: boolean;
  value: LookupValue | null;
  resolveTarget: () => Promise<string | null>;
  onOpenRelated: (target: FormTarget) => void;
  onChange: (value: DraftValue) => void;
}

/** Lookup control: shows the linked record (opens it if it's a ServiceHub table) and searches its table. */
function LookupEditor({ id, meta, readOnly, value, resolveTarget, onOpenRelated, onChange }: LookupEditorProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LookupOption[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [targetTable, setTargetTable] = useState<string | null>(value?.table || null);

  const related = value?.table ? findTable(value.table) : undefined;

  const search = async (text: string) => {
    setOpen(true);
    setStatus('Searching…');
    try {
      const table = targetTable ?? (await resolveTarget());
      if (!table) {
        setStatus('Couldn’t find which table this lookup points to.');
        return;
      }
      setTargetTable(table);
      const info = await lookupTableInfo(table);
      if (!info) {
        setStatus(`Couldn’t read the ${table} table to search it.`);
        return;
      }
      const results = await searchLookup(info, text);
      setOptions(results);
      setStatus(results.length ? null : 'No records found.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  const valueView = value ? (
    related ? (
      <button type="button" style={linkStyle} onClick={() => onOpenRelated({ table: related.table, label: related.label, id: value.id })}>
        <bdi>{value.name}</bdi>
      </button>
    ) : (
      <bdi>{value.name}</bdi>
    )
  ) : null;

  if (readOnly) {
    return (
      <div className="field-input" style={{ background: 'var(--neutral-200)', color: 'var(--text-body)', minHeight: 36 }}>
        {valueView ?? '—'}
      </div>
    );
  }

  return (
    <div className="search-select">
      {value && !open ? (
        <div className="field-input" style={{ display: 'flex', alignItems: 'center', gap: 8, paddingInlineStart: 30 }}>
          <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
          {valueView}
          <button type="button" className="cs-clear" aria-label={`Clear ${meta.label}`} onClick={() => onChange(null)}>×</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 'auto', marginInlineEnd: 20 }} onClick={() => void search('')}>
            Change
          </button>
        </div>
      ) : (
        <>
          <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
          <input
            id={id}
            className="field-input"
            placeholder={`Look for ${meta.label}`}
            dir="auto"
            value={query}
            onFocus={() => void search(query)}
            onChange={(event) => {
              setQuery(event.target.value);
              void search(event.target.value);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 200)}
          />
        </>
      )}
      <div className={`ss-list${open ? ' open' : ''}`} role="listbox">
        {status && <div className="ss-empty">{status}</div>}
        {!status &&
          options.map((option) => (
            <div
              key={option.id}
              className="ss-row"
              role="option"
              aria-selected={value?.id === option.id}
              tabIndex={0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange({ id: option.id, name: option.name, table: targetTable ?? '' });
                setQuery('');
                setOpen(false);
              }}
            >
              <bdi>{option.name}</bdi>
              {option.detail && <div className="ss-row-detail"><bdi>{option.detail}</bdi></div>}
            </div>
          ))}
      </div>
    </div>
  );
}
````

### `src/screens/form/PrincipalPicker.tsx`

````tsx
import { useState } from 'react';
import { People, Profile, SearchNormal1 } from 'iconsax-react';
import { errorMessage } from '../../data/dataverse';
import { searchPrincipals, type Principal } from '../../data/recordActions';

/** Search box for users and teams (Assign / Share). */
export function PrincipalPicker({ value, onChange }: { value: Principal | null; onChange: (principal: Principal | null) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Principal[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const search = async (text: string) => {
    setOpen(true);
    setStatus('Searching…');
    try {
      const found = await searchPrincipals(text);
      setResults(found);
      setStatus(found.length ? null : 'No users or teams found.');
    } catch (error) {
      setStatus(errorMessage(error));
    }
  };

  if (value) {
    return (
      <div className="attach-row">
        {value.kind === 'team' ? <People size={14} color="currentColor" /> : <Profile size={14} color="currentColor" />}
        <span style={{ flex: 1 }} dir="auto">{value.name}</span>
        <span className="sbadge sbadge-gray">{value.kind === 'team' ? 'Team' : 'User'}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }

  return (
    <div className="search-select">
      <span className="ss-icon"><SearchNormal1 size={12} color="currentColor" /></span>
      <input
        className="field-input"
        placeholder="Search users or teams"
        aria-label="Search users or teams"
        dir="auto"
        value={query}
        autoFocus
        onFocus={() => void search(query)}
        onChange={(event) => {
          setQuery(event.target.value);
          void search(event.target.value);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 200)}
      />
      <div className={`ss-list${open ? ' open' : ''}`} role="listbox">
        {status && <div className="ss-empty">{status}</div>}
        {!status &&
          results.map((principal) => (
            <div
              key={`${principal.kind}-${principal.id}`}
              className="ss-row"
              role="option"
              aria-selected={false}
              tabIndex={0}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(principal);
                setOpen(false);
              }}
            >
              {principal.kind === 'team' ? <People size={13} color="currentColor" /> : <Profile size={13} color="currentColor" />}
              <bdi>{principal.name}</bdi>
            </div>
          ))}
      </div>
    </div>
  );
}
````

### `src/screens/form/RecordDialogs.tsx`

````tsx
import { useState, type ReactNode } from 'react';
import type { TableRef } from '../../app/navigation';
import { errorMessage } from '../../data/dataverse';
import { assignRecord, shareRecord, type AccessRight, type Principal } from '../../data/recordActions';
import { PrincipalPicker } from './PrincipalPicker';

interface DialogProps {
  table: TableRef;
  /** Records to act on (one from the form, one or more from the grid). */
  ids: readonly string[];
  notify: (kind: 'success' | 'alert', text: string) => void;
  onDone: () => void;
  onClose: () => void;
}

async function forEachRecord(ids: readonly string[], action: (id: string) => Promise<void>): Promise<{ done: number; failures: string[] }> {
  let done = 0;
  const failures: string[] = [];
  for (const id of ids) {
    try {
      await action(id);
      done += 1;
    } catch (error) {
      failures.push(errorMessage(error));
    }
  }
  return { done, failures };
}

function DialogShell({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <div className="modal-overlay" role="presentation">
      <div className="modal-box" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-labelledby="record-dialog-title">
        <div className="modal-hdr">
          <div className="modal-title" id="record-dialog-title">{title}</div>
          <div className="modal-sub">{sub}</div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Assign: pick the new owner (user or team) for the record(s). */
export function AssignDialog({ table, ids, notify, onDone, onClose }: DialogProps) {
  const [owner, setOwner] = useState<Principal | null>(null);
  const [busy, setBusy] = useState(false);
  const assign = async () => {
    if (!owner) return;
    setBusy(true);
    const { done, failures } = await forEachRecord(ids, (id) => assignRecord(table, id, owner));
    setBusy(false);
    if (done) notify('success', `Assigned ${done} record${done === 1 ? '' : 's'} to ${owner.name}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };
  return (
    <DialogShell title={`Assign ${ids.length === 1 ? 'record' : `${ids.length} records`}`} sub="Choose the user or team that will own it.">
      <div className="form-field">
        <label className="field-lbl">Assign to</label>
        <PrincipalPicker value={owner} onChange={setOwner} />
      </div>
      <div className="modal-btn-row">
        <button type="button" className="btn btn-primary" disabled={!owner || busy} onClick={() => void assign()}>{busy ? 'Assigning…' : 'Assign'}</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </DialogShell>
  );
}

const SHARE_RIGHTS: { right: AccessRight; label: string }[] = [
  { right: 'ReadAccess', label: 'Read' },
  { right: 'WriteAccess', label: 'Write' },
  { right: 'DeleteAccess', label: 'Delete' },
  { right: 'AppendAccess', label: 'Append' },
  { right: 'AppendToAccess', label: 'Append To' },
  { right: 'AssignAccess', label: 'Assign' },
  { right: 'ShareAccess', label: 'Share' },
];

/** Share: grant a user or team access rights on the record(s). */
export function ShareDialog({ table, ids, notify, onDone, onClose }: DialogProps) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [rights, setRights] = useState<AccessRight[]>(['ReadAccess']);
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (!principal || !rights.length) return;
    setBusy(true);
    const { done, failures } = await forEachRecord(ids, (id) => shareRecord(table, id, principal, rights));
    setBusy(false);
    if (done) notify('success', `Shared ${done} record${done === 1 ? '' : 's'} with ${principal.name}.`);
    if (failures.length) notify('alert', `${failures.length} failed: ${failures[0]}`);
    onDone();
  };
  return (
    <DialogShell title={`Share ${ids.length === 1 ? 'record' : `${ids.length} records`}`} sub="Give a user or team access to this record.">
      <div className="form-field">
        <label className="field-lbl">Share with</label>
        <PrincipalPicker value={principal} onChange={setPrincipal} />
      </div>
      <div className="form-field">
        <label className="field-lbl">Permissions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SHARE_RIGHTS.map(({ right, label }) => {
            const checked = rights.includes(right);
            return (
              <label key={right} className={`sbadge ${checked ? 'sbadge-gold' : 'sbadge-gray'}`} style={{ cursor: 'pointer', gap: 4 }}>
                <input type="checkbox" checked={checked} onChange={() => setRights((items) => (checked ? items.filter((item) => item !== right) : [...items, right]))} />
                {label}
              </label>
            );
          })}
        </div>
      </div>
      <div className="modal-btn-row">
        <button type="button" className="btn btn-primary" disabled={!principal || !rights.length || busy} onClick={() => void share()}>{busy ? 'Sharing…' : 'Share'}</button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
      </div>
    </DialogShell>
  );
}
````

### `src/screens/form/RichTextEditor.tsx`

````tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { TableKit } from '@tiptap/extension-table';
import { Eraser, Link1, TextalignCenter, TextalignLeft, TextalignRight, TextBold, TextItalic, TextUnderline } from 'iconsax-react';
import { sanitizeRichText } from '../../data/formatCell';
import { useDismiss } from '../useDismiss';

/**
 * Rich text editor for Dataverse rich-text columns (the model-driven form uses CKEditor for these).
 * Built on TipTap; loaded lazily so it only costs download time when a rich field is edited.
 * Keeps what the stored CKEditor HTML uses: bold/italic/underline/strike, lists, alignment,
 * text direction, links, colours/font sizes and tables. Output is sanitized before it's saved.
 */

type Direction = 'rtl' | 'ltr';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockDirection: {
      setBlockDirection: (direction: Direction | null) => ReturnType;
    };
  }
}

/** `dir` on paragraphs, headings and list items — Arabic and English are mixed in the same field. */
const BlockDirection = Extension.create({
  name: 'blockDirection',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'listItem', 'bulletList', 'orderedList'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute('dir'),
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setBlockDirection:
        (direction) =>
        ({ commands }) =>
          ['paragraph', 'heading', 'listItem'].map((type) => commands.updateAttributes(type, { dir: direction })).some(Boolean),
    };
  },
});

interface RichTextEditorProps {
  id: string;
  initialHtml: string;
  onChange: (html: string) => void;
}

/** An editor with nothing but empty paragraphs means "no value" for Dataverse. */
const normalize = (editor: Editor) => (editor.isEmpty ? '' : sanitizeRichText(editor.getHTML()));

export default function RichTextEditor({ id, initialHtml, onChange }: RichTextEditorProps) {
  // The editor is created once; its update callback always calls the latest onChange.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyleKit,
      TableKit.configure({ table: { resizable: false } }),
      BlockDirection,
    ],
    content: sanitizeRichText(initialHtml),
    editorProps: {
      attributes: { id, class: 'field-input rich-text', dir: 'auto', style: 'min-height:120px;cursor:text' },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(normalize(current)),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      strike: current?.isActive('strike') ?? false,
      bullet: current?.isActive('bulletList') ?? false,
      ordered: current?.isActive('orderedList') ?? false,
      left: current?.isActive({ textAlign: 'left' }) ?? false,
      center: current?.isActive({ textAlign: 'center' }) ?? false,
      right: current?.isActive({ textAlign: 'right' }) ?? false,
      link: current?.isActive('link') ?? false,
      color: (current?.getAttributes('textStyle').color as string | undefined) ?? null,
      background: (current?.getAttributes('textStyle').backgroundColor as string | undefined) ?? null,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  if (!editor || !state) return <div className="field-input" style={{ minHeight: 120 }} />;

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address', previous ?? 'https://');
    if (url === null) return;
    if (!url.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div>
      <div role="toolbar" aria-label="Formatting" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        <Tool label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><TextBold size={14} color="currentColor" /></Tool>
        <Tool label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><TextItalic size={14} color="currentColor" /></Tool>
        <Tool label="Underline" active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><TextUnderline size={14} color="currentColor" /></Tool>
        <Tool label="Strikethrough" active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Tool>
        <Separator />
        <Tool label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>•≡</Tool>
        <Tool label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.≡</Tool>
        <Separator />
        <Tool label="Align left" active={state.left} onClick={() => editor.chain().focus().setTextAlign('left').run()}><TextalignLeft size={14} color="currentColor" /></Tool>
        <Tool label="Align center" active={state.center} onClick={() => editor.chain().focus().setTextAlign('center').run()}><TextalignCenter size={14} color="currentColor" /></Tool>
        <Tool label="Align right" active={state.right} onClick={() => editor.chain().focus().setTextAlign('right').run()}><TextalignRight size={14} color="currentColor" /></Tool>
        <Tool label="Right to left (Arabic)" onClick={() => editor.chain().focus().setBlockDirection('rtl').run()}>RTL</Tool>
        <Tool label="Left to right" onClick={() => editor.chain().focus().setBlockDirection('ltr').run()}>LTR</Tool>
        <Separator />
        <ColorMenu
          label="Font color"
          current={state.color}
          onPick={(color) => (color ? editor.chain().focus().setColor(color).run() : editor.chain().focus().unsetColor().run())}
        />
        <ColorMenu
          label="Background color"
          background
          current={state.background}
          onPick={(color) => (color ? editor.chain().focus().setBackgroundColor(color).run() : editor.chain().focus().unsetBackgroundColor().run())}
        />
        <Tool label="Link" active={state.link} onClick={setLink}><Link1 size={14} color="currentColor" /></Tool>
        <Tool label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={14} color="currentColor" /></Tool>
        <Separator />
        <Tool label="Undo" disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()}>↶</Tool>
        <Tool label="Redo" disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()}>↷</Tool>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Tool({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      // Keep the text selection in the editor while clicking the toolbar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={{ minWidth: 30, padding: '0 8px', height: 28 }}
    >
      {children}
    </button>
  );
}

// The model-driven rich text editor's (CKEditor 5) default palette, same values, so colours saved
// here match colours saved there.
const PALETTE: { value: string; label: string }[] = [
  { value: 'hsl(0, 0%, 0%)', label: 'Black' },
  { value: 'hsl(0, 0%, 30%)', label: 'Dim grey' },
  { value: 'hsl(0, 0%, 60%)', label: 'Grey' },
  { value: 'hsl(0, 0%, 90%)', label: 'Light grey' },
  { value: 'hsl(0, 0%, 100%)', label: 'White' },
  { value: 'hsl(0, 75%, 60%)', label: 'Red' },
  { value: 'hsl(30, 75%, 60%)', label: 'Orange' },
  { value: 'hsl(60, 75%, 60%)', label: 'Yellow' },
  { value: 'hsl(90, 75%, 60%)', label: 'Light green' },
  { value: 'hsl(120, 75%, 60%)', label: 'Green' },
  { value: 'hsl(150, 75%, 60%)', label: 'Aquamarine' },
  { value: 'hsl(180, 75%, 60%)', label: 'Turquoise' },
  { value: 'hsl(210, 75%, 60%)', label: 'Light blue' },
  { value: 'hsl(240, 75%, 60%)', label: 'Blue' },
  { value: 'hsl(270, 75%, 60%)', label: 'Purple' },
];

interface ColorMenuProps {
  label: string;
  /** Background (highlight) colour instead of font colour. */
  background?: boolean;
  current: string | null;
  onPick: (color: string | null) => void;
}

/** Font / background colour button with the model-driven palette, "Remove color" and a custom colour. */
function ColorMenu({ label, background = false, current, onPick }: ColorMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Stays open while choosing; closes on a click outside, Escape, or after a colour is picked.
  useDismiss(wrapperRef, open, () => setOpen(false));
  const pick = (color: string | null) => {
    onPick(color);
    setOpen(false);
  };
  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        style={{ minWidth: 34, padding: '0 6px', height: 28, flexDirection: 'column', gap: 1 }}
      >
        <span style={{ fontWeight: 700, lineHeight: 1, padding: background ? '0 3px' : 0, background: background ? (current ?? 'hsl(60, 75%, 60%)') : undefined }}>A</span>
        {!background && <span aria-hidden="true" style={{ width: 14, height: 3, borderRadius: 2, background: current ?? 'hsl(0, 75%, 60%)' }} />}
      </button>
      {open && (
        <div className="ss-list open" role="menu" aria-label={label} style={{ width: 196, padding: 8, zIndex: 60 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
            {PALETTE.map((color) => (
              <button
                key={color.value}
                type="button"
                role="menuitem"
                title={color.label}
                aria-label={color.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(color.value)}
                style={{
                  width: 28, height: 28, borderRadius: 6, cursor: 'pointer', background: color.value,
                  border: current === color.value ? '2px solid var(--brand-gold)' : '1px solid var(--border-hover)',
                }}
              />
            ))}
          </div>
          <div className="ss-row" role="menuitem" tabIndex={0} style={{ marginTop: 6 }} onMouseDown={(event) => event.preventDefault()} onClick={() => pick(null)}>
            Remove color
          </div>
          <label className="ss-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            Custom color…
            <input type="color" aria-label={`Custom ${label.toLowerCase()}`} onChange={(event) => pick(event.target.value)} style={{ marginInlineStart: 'auto', width: 28, height: 22, border: 'none', background: 'none' }} />
          </label>
        </div>
      )}
    </div>
  );
}

const Separator = () => <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '2px 4px' }} />;
````

### `src/screens/form/RichTextField.tsx`

````tsx
import { lazy, Suspense } from 'react';
import { sanitizeRichText } from '../../data/formatCell';

// TipTap is only downloaded the first time someone edits a rich-text field.
const RichTextEditor = lazy(() => import('./RichTextEditor'));

interface RichTextFieldProps {
  id: string;
  html: string;
  readOnly: boolean;
  onChange: (html: string) => void;
}

/** Rich-text column on a form: formatted editor when editable, formatted (sanitized) view otherwise. */
export function RichTextField({ id, html, readOnly, onChange }: RichTextFieldProps) {
  const view = (
    <div
      id={id}
      className="field-input rich-text"
      dir="auto"
      style={{ minHeight: 60, background: readOnly ? 'var(--neutral-200)' : undefined, fontSize: 12.5 }}
      dangerouslySetInnerHTML={{ __html: html ? sanitizeRichText(html) : '—' }}
    />
  );
  if (readOnly) return view;
  return (
    <Suspense fallback={view}>
      <RichTextEditor id={id} initialHtml={html} onChange={onChange} />
    </Suspense>
  );
}
````

### `src/screens/form/SubgridView.tsx`

````tsx
import { useState } from 'react';
import { findTable } from '../../app/navigation';
import { onFileLinkClick } from '../../data/fileLinks';
import { cellLink, formatCell } from '../../data/formatCell';
import type { FormSubgrid } from '../../data/forms';
import { loadSubgrid } from '../../data/related';
import { useAsyncData } from '../../data/useAsyncData';
import type { FormTarget } from '../RecordForm';

interface SubgridViewProps {
  subgrid: FormSubgrid;
  parentTable: string;
  parentId: string;
  /** Changes when the parent record is refreshed/saved, to reload the related rows. */
  reloadKey: number;
  onOpen: (target: FormTarget) => void;
}

const linkStyle = { color: 'var(--gold-dark)', textDecoration: 'underline' } as const;

/** Related records on the form (the model-driven subgrid), first 10 rows; click a row to open it. */
export function SubgridView({ subgrid, parentTable, parentId, reloadKey, onOpen }: SubgridViewProps) {
  const data = useAsyncData(`${subgrid.id}#${parentId}#${reloadKey}`, () => loadSubgrid(subgrid, parentTable, parentId));
  const opensInHub = data.data ? findTable(data.data.table.logicalName) : undefined;
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="action-card">
      <div className="ro-title">
        {subgrid.label}
        {data.data && <span className="seg-count">{data.data.result.totalCount ?? data.data.result.rows.length}</span>}
      </div>
      {data.loading && <div className="loader-text">Loading related records…</div>}
      {data.error && <div className="section-note" dir="auto">{data.error}</div>}
      {data.data && !data.data.result.rows.length && <div className="req-dim" style={{ fontSize: 12 }}>No related records.</div>}
      {data.data && data.data.result.rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="req-table">
            <thead>
              <tr>
                {data.data.view.columns.map((column) => (
                  <th key={column.name} style={{ minWidth: Math.min(column.width, 220) }}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.data.result.rows.map((row, index) => {
                const id = row[`${data.data?.table.logicalName}id`];
                const target = typeof id === 'string' && opensInHub ? { table: opensInHub.table, label: opensInHub.label, id } : null;
                return (
                  // Like the model-driven subgrid: a click selects the row, a double-click opens it.
                  <tr
                    key={typeof id === 'string' ? id : index}
                    aria-selected={target ? picked === target.id : undefined}
                    onClick={target ? () => setPicked(target.id) : undefined}
                    onDoubleClick={target ? () => { window.getSelection()?.removeAllRanges(); onOpen(target); } : undefined}
                  >
                    {data.data?.view.columns.map((column) => {
                      const text = formatCell(row, column);
                      const url = cellLink(row, column);
                      return (
                        <td key={column.name} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }} title={text}>
                          {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={linkStyle} onClick={(event) => onFileLinkClick(event, url, text)}>{text}</a> : text ? <bdi>{text}</bdi> : <span className="req-dim">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.data.result.moreRecords && <div className="req-dim" style={{ fontSize: 11, padding: '6px 16px' }}>Showing the first 10 records.</div>}
        </div>
      )}
    </div>
  );
}
````

### `src/screens/form/values.ts`

````ts
import { columnMeta, type ColumnMeta } from '../../data/columnMeta';
import type { DataverseRow } from '../../data/dataverse';
import type { FormField } from '../../data/forms';
import { lookupTableInfo } from '../../data/lookups';
import type { DraftValue, LookupValue } from './FieldEditor';

// System columns the model-driven form never lets users type into.
export const SYSTEM_READ_ONLY = new Set([
  'createdon', 'modifiedon', 'createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby',
  'ownerid', 'owningbusinessunit', 'statecode', 'statuscode', 'versionnumber',
]);

/** Schema metadata for a form field (a neutral text column when the schema doesn't know it). */
export const metaFor = (tableLogicalName: string, field: FormField): ColumnMeta =>
  columnMeta(tableLogicalName, field.name) ?? {
    name: field.name, label: field.label, kind: field.kind, options: [], multiSelect: false, twoOption: false, required: false, readOnly: false,
  };

export const isEmptyValue = (value: DraftValue) => value === null || value === '' || (Array.isArray(value) && !value.length);

/** Editor value for a field from a loaded record. */
export function currentValue(row: DataverseRow, meta: ColumnMeta): DraftValue {
  if (meta.kind === 'lookup') {
    const id = row[`_${meta.name}_value`];
    if (typeof id !== 'string') return null;
    const name = row[`_${meta.name}_value@OData.Community.Display.V1.FormattedValue`];
    const table = row[`_${meta.name}_value@Microsoft.Dynamics.CRM.lookuplogicalname`];
    return { id, name: typeof name === 'string' ? name : id, table: typeof table === 'string' ? table : '' };
  }
  const raw = row[meta.name];
  if (raw === null || raw === undefined) return meta.multiSelect ? [] : '';
  if (meta.multiSelect) return String(raw).split(',').filter(Boolean);
  if (meta.kind === 'date') return String(raw).slice(0, 10);
  if (typeof raw === 'boolean') return raw ? '1' : '0';
  return String(raw);
}

/** Editor value -> Web API value for create/update (non-lookup columns). */
function toDataverse(meta: ColumnMeta, value: DraftValue): unknown {
  if (isEmptyValue(value)) return null;
  if (meta.multiSelect && Array.isArray(value)) return value.join(',');
  if (typeof value !== 'string') return null;
  if (meta.twoOption) return value === '1';
  if (meta.kind === 'choice' || meta.kind === 'number') return Number(value);
  return value;
}

/** Changed fields -> Web API payload; lookups become `Nav@odata.bind` (or null to clear). */
export async function buildPayload(tableLogicalName: string, draft: Record<string, DraftValue>): Promise<DataverseRow> {
  const payload: DataverseRow = {};
  for (const [name, value] of Object.entries(draft)) {
    const meta = columnMeta(tableLogicalName, name);
    if (!meta) continue;
    if (meta.kind !== 'lookup') {
      payload[name] = toDataverse(meta, value);
      continue;
    }
    if (!meta.navigationProperty) continue;
    const lookup = value as LookupValue | null;
    if (!lookup) {
      payload[`${meta.navigationProperty}@odata.bind`] = null;
      continue;
    }
    const info = await lookupTableInfo(lookup.table);
    if (!info) throw new Error(`Can't save ${meta.label}: the ${lookup.table} table isn't available.`);
    payload[`${meta.navigationProperty}@odata.bind`] = `/${info.entitySet}(${lookup.id})`;
  }
  return payload;
}
````

## Supporting ServiceHub files (trim to what the new system needs)

The engine imports these. What it actually uses:

- `app/region.ts` + `regionContext.ts` + `RegionProvider.tsx`: a two-value scope (Egypt / KSA) that picks the default view and filters hub data. Keep it if the new system has a similar scope; otherwise remove the region imports from `views.ts`, `TableScreen.tsx`, `ViewGrid.tsx` and `AppShell.tsx`.
- `app/hubSections.ts`: the Service Hub sections, used by `AppShell.tsx` for the hub entry. Replace with the new system's pages.
- `data/hub/common.ts`: `clearHubCache` and small row helpers used by `HubCommon.tsx`.
- `data/hub/library.ts`: only `embedUrl` and `openInNewTab` are needed by `fileLinks.ts`; the rest (ServiceHub document tables, and its `./specialties` import) can go.
- `src/generated/*` is produced by `pa add data-source`; `src/data/columnLabels.generated.ts` by `npm run labels` (`scripts/build-column-labels.mjs`).

### `src/app/region.ts`

````ts
export type Region = 'EGY' | 'KSA';

export const REGIONS: readonly Region[] = ['EGY', 'KSA'];

export const REGION_LABEL: Record<Region, string> = {
  EGY: 'Egypt',
  KSA: 'Saudi Arabia',
};

/** Two-letter mark shown in the gold region badge (flag emoji do not render on Windows). */
export const REGION_MARK: Record<Region, string> = {
  EGY: 'EG',
  KSA: 'SA',
};

/** Dataverse choice value of the `cr18c_region` / `cr18c_regionchoice` columns. */
export const REGION_CHOICE_VALUE: Record<Region, number> = {
  EGY: 983080000,
  KSA: 983080001,
};

/** Price currency shown next to fees and prices. */
export const REGION_CURRENCY: Record<Region, string> = {
  EGY: 'LE',
  KSA: 'SAR',
};

export const isRegion = (value: unknown): value is Region =>
  value === 'EGY' || value === 'KSA';
````

### `src/app/regionContext.ts`

````ts
import { createContext, useContext } from 'react';
import type { Region } from './region';

export interface RegionContextValue {
  /** null until the user picks a region (first visit in this session), like the legacy page. */
  region: Region | null;
  setRegion: (region: Region) => void;
}

export const RegionContext = createContext<RegionContextValue | null>(null);

export function useRegionContext(): RegionContextValue {
  const value = useContext(RegionContext);
  if (!value) throw new Error('useRegionContext must be used inside <RegionProvider>.');
  return value;
}

/** Selected region for screens, which only render once a region has been chosen. */
export function useRegion(): Region {
  const { region } = useRegionContext();
  if (!region) throw new Error('useRegion called before a region was selected.');
  return region;
}
````

### `src/app/RegionProvider.tsx`

````tsx
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { isRegion, type Region } from './region';
import { RegionContext } from './regionContext';

// Same key as the legacy web resource, so a user's last region carries over within a session.
const STORAGE_KEY = 'selectedRegion';

function readStoredRegion(): Region | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isRegion(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState<Region | null>(readStoredRegion);

  const setRegion = useCallback((next: Region) => {
    setRegionState(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked inside the Power Apps host; the in-memory value still applies.
    }
  }, []);

  const value = useMemo(() => ({ region, setRegion }), [region, setRegion]);
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}
````

### `src/app/hubSections.ts`

````ts
import {
  Bank,
  Book,
  Box,
  Calendar,
  Card,
  Clock,
  Crown1,
  DiscountShape,
  DocumentText,
  DocumentText1,
  Health,
  Heart,
  Home2,
  Hospital,
  Link,
  Location,
  MedalStar,
  MessageQuestion,
  Microscope,
  Profile2User,
  Scissor,
  Setting2,
  ShieldTick,
  TickCircle,
  type Icon,
} from 'iconsax-react';
import type { Region } from './region';

/**
 * Sections of the "Andalusia Service Hub" page — the rebuilt legacy web resource (region.html).
 * Top-nav labels and order, the Quick Links / Health Libraries sub-tabs, and page titles and
 * subtitles all mirror the legacy page so users see the same names in the same places.
 */

export type HubSectionId =
  | 'doctors'
  | 'services'
  | 'packages'
  | 'specialties'
  | 'coe'
  | 'locations'
  | 'procedure-clinics'
  | 'bank-accounts'
  | 'offers'
  | 'programs'
  | 'home-care'
  | 'scripts'
  | 'insurance'
  | 'events'
  | 'installments'
  | 'booking-policy'
  | 'system-links'
  | 'qa-tips'
  | 'crm-dictionary'
  | 'working-hours'
  | 'special-handling'
  | 'cpgs'
  | 'capex'
  | 'other-health-info';

/** Legacy top-nav entries that open a group of sub-tabs instead of a single screen. */
export type HubGroupId = 'quick-links' | 'health-libraries';

interface PageHeading {
  title: string;
  subtitle: string;
}

export interface HubSection {
  id: HubSectionId;
  /** Tab text — same wording as the legacy nav bar / internal tabs. */
  label: string;
  icon: Icon;
  /** Set for sections that live under a legacy top-nav group (Quick Links, Health Libraries). */
  group?: HubGroupId;
  /** Regions where the section exists. Hidden elsewhere. */
  regions: readonly Region[];
  /** Page header (legacy h1 + subtitle). Some sections word it differently per region. */
  heading: PageHeading | Record<Region, PageHeading>;
}

export interface HubGroup {
  id: HubGroupId;
  label: string;
  icon: Icon;
}

const BOTH: readonly Region[] = ['EGY', 'KSA'];
const EGY_ONLY: readonly Region[] = ['EGY'];
const KSA_ONLY: readonly Region[] = ['KSA'];

export const HUB_GROUPS: Record<HubGroupId, HubGroup> = {
  'quick-links': { id: 'quick-links', label: 'Quick Links', icon: DocumentText },
  'health-libraries': { id: 'health-libraries', label: 'Health Libraries', icon: DocumentText1 },
};

export const HUB_SECTIONS: readonly HubSection[] = [
  { id: 'doctors', label: 'Doctors', icon: Profile2User, regions: BOTH, heading: { title: 'Doctors Directory', subtitle: 'Search and filter doctors' } },
  { id: 'services', label: 'Services', icon: Health, regions: BOTH, heading: { title: 'Andalusia Services', subtitle: 'Browse our medical services' } },
  { id: 'packages', label: 'Packages', icon: Box, regions: BOTH, heading: { title: 'Andalusia Packages', subtitle: 'Browse our medical packages' } },
  { id: 'specialties', label: 'Specialties', icon: Hospital, regions: BOTH, heading: { title: 'Medical Specialties', subtitle: 'Browse specialties' } },
  { id: 'coe', label: 'COE', icon: MedalStar, regions: BOTH, heading: { title: 'Centers of Excellence', subtitle: 'Explore specialized clinics' } },
  { id: 'locations', label: 'Locations', icon: Location, regions: BOTH, heading: { title: 'Andalusia Locations', subtitle: 'Find Andalusia branches' } },

  // Quick Links — legacy internal tab order
  {
    id: 'scripts', group: 'quick-links', label: 'Scripts & Knowledge', icon: DocumentText, regions: BOTH,
    heading: {
      EGY: { title: 'EGY Scripts & Knowledge', subtitle: 'Internal scripts & knowledge hub – Egypt' },
      KSA: { title: 'Scripts & Knowledge', subtitle: 'Internal scripts & knowledge hub' },
    },
  },
  {
    id: 'insurance', group: 'quick-links', label: 'Insurance', icon: ShieldTick, regions: BOTH,
    heading: {
      EGY: { title: 'Insurance', subtitle: 'Insurance companies – Egypt' },
      KSA: { title: 'Insurance', subtitle: 'Insurance companies – KSA' },
    },
  },
  { id: 'events', group: 'quick-links', label: 'Events', icon: Calendar, regions: KSA_ONLY, heading: { title: 'Events', subtitle: 'Internal events & schedules' } },
  { id: 'installments', group: 'quick-links', label: 'Installments', icon: Card, regions: KSA_ONLY, heading: { title: 'Installments', subtitle: 'Installment plans & schedules' } },
  {
    id: 'booking-policy', group: 'quick-links', label: 'Booking Policy & Discounts', icon: Book, regions: BOTH,
    heading: {
      EGY: { title: 'Booking Policy & Discounts', subtitle: 'Egypt – Booking policy by Business Unit' },
      KSA: { title: 'Booking Policy & Discounts', subtitle: 'KSA – Booking policy' },
    },
  },
  {
    id: 'system-links', group: 'quick-links', label: 'System Links', icon: Link, regions: BOTH,
    heading: {
      EGY: { title: 'System Links', subtitle: 'Egypt – Hospital systems' },
      KSA: { title: 'System Links', subtitle: 'KSA – Hospital systems' },
    },
  },
  {
    id: 'qa-tips', group: 'quick-links', label: 'Quality Assurance Tips', icon: TickCircle, regions: BOTH,
    heading: {
      EGY: { title: 'Quality Assurance Tips', subtitle: 'Egypt – QA guidelines' },
      KSA: { title: 'Quality Assurance Tips', subtitle: 'KSA – QA guidelines' },
    },
  },
  {
    id: 'crm-dictionary', group: 'quick-links', label: 'CRM Dictionary', icon: MessageQuestion, regions: BOTH,
    heading: {
      EGY: { title: 'CRM Dictionary', subtitle: 'Egypt – CRM reasons & definitions' },
      KSA: { title: 'CRM Dictionary', subtitle: 'KSA – CRM references' },
    },
  },
  {
    id: 'working-hours', group: 'quick-links', label: 'Department Working Hours', icon: Clock, regions: BOTH,
    heading: {
      EGY: { title: 'Department Working Hours', subtitle: 'Egypt – Departments & working hours' },
      KSA: { title: 'Department Working Hours', subtitle: 'KSA – Departments references' },
    },
  },
  { id: 'special-handling', group: 'quick-links', label: 'Special Handling', icon: Setting2, regions: KSA_ONLY, heading: { title: 'Special Handling', subtitle: 'Special cases & handling procedures' } },

  { id: 'procedure-clinics', label: 'Procedure Clinics', icon: Scissor, regions: EGY_ONLY, heading: { title: 'Procedure Clinics', subtitle: 'Egypt Procedure Clinics' } },
  { id: 'bank-accounts', label: 'Bank Accounts', icon: Bank, regions: KSA_ONLY, heading: { title: 'Bank Accounts', subtitle: 'KSA Bank Account Information' } },
  {
    id: 'offers', label: 'Offers', icon: DiscountShape, regions: BOTH,
    heading: {
      EGY: { title: 'EGY Offers', subtitle: 'Current medical offers – Egypt' },
      KSA: { title: 'KSA Offers', subtitle: 'Current approved offers – KSA' },
    },
  },
  { id: 'programs', label: 'Programs', icon: Crown1, regions: BOTH, heading: { title: 'Programs', subtitle: 'Programs & packages' } },
  { id: 'home-care', label: 'Home Care', icon: Home2, regions: BOTH, heading: { title: 'Home Care', subtitle: 'Select a Business Unit to get started' } },

  // Health Libraries — legacy tab order (Media Content was never implemented in the legacy page)
  { id: 'cpgs', group: 'health-libraries', label: 'All CPGs & Protocols', icon: DocumentText1, regions: BOTH, heading: { title: 'CPGs & Protocols', subtitle: 'Clinical practice guidelines & protocols' } },
  { id: 'capex', group: 'health-libraries', label: 'CAPEX', icon: Microscope, regions: BOTH, heading: { title: 'CAPEX', subtitle: 'Capital expenditure devices & equipment' } },
  { id: 'other-health-info', group: 'health-libraries', label: 'Other Health Info', icon: Heart, regions: BOTH, heading: { title: 'Other Health Info', subtitle: 'Additional health-related information' } },
];

/** One entry of the legacy top nav: a single section, or a group that opens its first sub-tab. */
export type HubNavEntry =
  | { kind: 'section'; section: HubSection }
  | { kind: 'group'; group: HubGroup; sections: HubSection[] };

export const DEFAULT_HUB_SECTION_ID: HubSectionId = 'doctors';

const sectionById = new Map<HubSectionId, HubSection>(HUB_SECTIONS.map((section) => [section.id, section]));

export const getHubSection = (id: HubSectionId): HubSection => {
  const section = sectionById.get(id);
  if (!section) throw new Error(`Unknown hub section: ${id}`);
  return section;
};

export const isSectionInRegion = (section: HubSection, region: Region): boolean =>
  section.regions.includes(region);

export const sectionHeading = (section: HubSection, region: Region): PageHeading =>
  'title' in section.heading ? section.heading : section.heading[region];

/** Legacy top-nav order for a region; groups sit where the legacy nav link was. */
export function hubNavForRegion(region: Region): HubNavEntry[] {
  const entries: HubNavEntry[] = [];
  const seenGroups = new Set<HubGroupId>();
  for (const section of HUB_SECTIONS) {
    if (!isSectionInRegion(section, region)) continue;
    if (!section.group) {
      entries.push({ kind: 'section', section });
      continue;
    }
    if (seenGroups.has(section.group)) continue;
    seenGroups.add(section.group);
    const groupId = section.group;
    entries.push({
      kind: 'group',
      group: HUB_GROUPS[groupId],
      sections: HUB_SECTIONS.filter((item) => item.group === groupId && isSectionInRegion(item, region)),
    });
  }
  return entries;
}
````

### `src/data/hub/common.ts`

````ts
import type { Region } from '../../app/region';
import { listRows, type DataverseRow } from '../dataverse';
import { pageFetchXml } from '../views';

/**
 * Shared data helpers for the Andalusia Service Hub pages (the rebuilt legacy web resource).
 * Queries mirror region.html; unlike it, every page of a result set is read (the legacy page
 * stopped at $top=5000 on most tables).
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const PAGE = 5000;
const MAX_PAGES = 40;

/** All rows of a FetchXML query, following FetchXML paging. */
export async function fetchAllRows(entitySet: string, fetchXml: string): Promise<DataverseRow[]> {
  const rows: DataverseRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await listRows({ entitySet, fetchXml: pageFetchXml(fetchXml, page, PAGE).fetchXml });
    rows.push(...result.rows);
    if (!(result.moreRecords ?? result.rows.length === PAGE)) break;
  }
  return rows;
}

/** FetchXML for active rows of a table with the given attributes (and optional extra filter XML). */
export function activeRowsFetch(entity: string, attributes: readonly string[], extraFilter = '', extra = ''): string {
  const attributeXml = attributes.map((name) => `<attribute name="${name}" />`).join('');
  return `<fetch version="1.0" mapping="logical"><entity name="${entity}">${attributeXml}<filter type="and"><condition attribute="statecode" operator="eq" value="0" />${extraFilter}</filter>${extra}</entity></fetch>`;
}

// ---- tolerant field readers ----

export const text = (row: DataverseRow | undefined, name: string): string => {
  const value = row?.[name];
  return value === null || value === undefined ? '' : String(value);
};

export const num = (row: DataverseRow | undefined, name: string): number | null => {
  const value = row?.[name];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

/** Lookup id (`_name_value`). */
export const lookupId = (row: DataverseRow | undefined, name: string): string => text(row, `_${name}_value`);

/** Display name of a lookup or choice (server formatted value). */
export const formatted = (row: DataverseRow | undefined, name: string): string =>
  text(row, `${name}${FORMATTED}`) || text(row, `_${name}_value${FORMATTED}`);

const lower = (value: string) => value.toLowerCase();
export const includesText = (haystack: readonly string[], needle: string) => {
  const search = lower(needle.trim());
  return !search || haystack.some((value) => lower(value).includes(search));
};

// ---- cache (same idea as the legacy page's in-memory caches, per region) ----

const cache = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let entry = cache.get(key) as Promise<T> | undefined;
  if (!entry) {
    entry = load();
    cache.set(key, entry);
    entry.catch(() => cache.delete(key));
  }
  return entry;
}

/** Drop cached data (the legacy "Refresh" button). */
export function clearHubCache(prefix = ''): void {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

// ---- business units of a region (legacy loadBUs) ----

export interface BusinessUnit {
  id: string;
  name: string;
}

/** Service Hub business units (application tag 999740008) of the region, like the legacy page. */
export function loadRegionBUs(region: Region): Promise<BusinessUnit[]> {
  return cached(`bu:${region}`, async () => {
    const fetchXml = `<fetch version="1.0" mapping="logical"><entity name="businessunit"><attribute name="businessunitid" /><attribute name="name" /><filter type="and"><condition attribute="isdisabled" operator="eq" value="0" /><condition attribute="cr603_application_tag" operator="contain-values"><value>999740008</value></condition></filter><link-entity name="crd04_regions" from="crd04_regionsid" to="cr603_region" alias="reg"><filter type="and"><condition attribute="crd04_id" operator="eq" value="${region}" /></filter></link-entity></entity></fetch>`;
    const rows = await fetchAllRows('businessunits', fetchXml);
    return rows
      .map((row) => ({ id: text(row, 'businessunitid'), name: text(row, 'name') }))
      .filter((bu) => bu.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

// ---- FetchXML fragments ----

/** Escapes a value for a FetchXML attribute. */
export const xmlValue = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** `eq` for one id, `in` for several (empty string for none). */
export function idCondition(attribute: string, ids: readonly string[]): string {
  if (ids.length === 0) return '';
  if (ids.length === 1) return `<condition attribute="${attribute}" operator="eq" value="${xmlValue(ids[0])}" />`;
  return `<condition attribute="${attribute}" operator="in">${ids.map((id) => `<value>${xmlValue(id)}</value>`).join('')}</condition>`;
}

/** "Contains" search across text columns (empty string for no search). */
export function searchCondition(attributes: readonly string[], search: string): string {
  const term = search.trim().replace(/[%_[\]]/g, (char) => `[${char}]`);
  if (!term) return '';
  return `<filter type="or">${attributes.map((name) => `<condition attribute="${name}" operator="like" value="%${xmlValue(term)}%" />`).join('')}</filter>`;
}

/** "Found 3 doctors" */
export const foundText = (count: number, noun: string, plural = `${noun}s`) => `Found ${count} ${count === 1 ? noun : plural}`;
````

### `src/data/hub/library.ts`

````ts
import { REGION_CHOICE_VALUE, type Region } from '../../app/region';
import { activeRowsFetch, cached, fetchAllRows, formatted, loadRegionBUs, lookupId, num, text, type BusinessUnit } from './common';
import { loadSpecialties, regionSpecialties } from './specialties';

/**
 * Region-filtered link/document tables: Events, Installments, Special Handling, System Links and
 * Other Health Info (a name + a URL each), plus CPGs & Protocols and CAPEX.
 */

export type DocumentKind = 'events' | 'installments' | 'special-handling' | 'system-links' | 'other-health-info';

const DOCUMENT_TABLES: Record<DocumentKind, { entity: string; set: string; url: string }> = {
  events: { entity: 'cr18c_servhubevent', set: 'cr18c_servhubevents', url: 'cr18c_iframeurl' },
  installments: { entity: 'cr18c_servhubinstallment', set: 'cr18c_servhubinstallments', url: 'cr18c_iframeurl' },
  'special-handling': { entity: 'cr18c_servhubspecialhandling', set: 'cr18c_servhubspecialhandlings', url: 'cr18c_iframeurl' },
  'system-links': { entity: 'cr18c_servhubsystemlink', set: 'cr18c_servhubsystemlinks', url: 'cr18c_systemlink' },
  'other-health-info': { entity: 'cr18c_otherhealthinfo', set: 'cr18c_otherhealthinfos', url: 'cr18c_iframeurl' },
};

export interface HubDocument {
  id: string;
  name: string;
  url: string;
}

const regionCondition = (region: Region) => `<condition attribute="cr18c_region" operator="eq" value="${REGION_CHOICE_VALUE[region]}" />`;

export function loadDocuments(kind: DocumentKind, region: Region): Promise<HubDocument[]> {
  return cached(`docs:${kind}:${region}`, async () => {
    const table = DOCUMENT_TABLES[kind];
    const rows = await fetchAllRows(table.set, activeRowsFetch(table.entity, [`${table.entity}id`, 'cr18c_name', table.url], regionCondition(region)));
    return rows
      .map((row) => ({ id: text(row, `${table.entity}id`), name: text(row, 'cr18c_name'), url: text(row, table.url) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export interface Guideline extends HubDocument {
  specialtyId: string;
  specialtyName: string;
}

export interface GuidelinesData {
  guidelines: Guideline[];
  specialties: { id: string; name: string }[];
}

/** CPGs & Protocols of the region (legacy renderCPGs). */
export function loadGuidelines(region: Region): Promise<GuidelinesData> {
  return cached(`cpgs:${region}`, async () => {
    const [specialties, rows] = await Promise.all([
      loadSpecialties(),
      fetchAllRows('cr18c_servhubcpgprotocols', activeRowsFetch('cr18c_servhubcpgprotocol', ['cr18c_servhubcpgprotocolid', 'cr18c_name', 'cr18c_iframeurl', 'cr18c_specialty'], regionCondition(region))),
    ]);
    const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
    return {
      guidelines: rows
        .map((row) => ({
          id: text(row, 'cr18c_servhubcpgprotocolid'),
          name: text(row, 'cr18c_name'),
          url: text(row, 'cr18c_iframeurl'),
          specialtyId: lookupId(row, 'cr18c_specialty'),
          specialtyName: specialtyName.get(lookupId(row, 'cr18c_specialty')) ?? formatted(row, 'cr18c_specialty'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      specialties: regionSpecialties(specialties, region).map(({ id, name }) => ({ id, name })),
    };
  });
}

export const DEVICE_STATUS: Record<number, { label: string; badge: string }> = {
  0: { label: 'On Hold', badge: 'sbadge-amber' },
  1: { label: 'Working', badge: 'sbadge-green' },
  2: { label: 'Out Of Service', badge: 'sbadge-red' },
};

export interface CapexItem extends Guideline {
  status: number | null;
  imageUrl: string;
  descriptionEn: string;
  descriptionAr: string;
  buId: string;
  buName: string;
}

export interface CapexData {
  items: CapexItem[];
  bus: BusinessUnit[];
  specialties: { id: string; name: string }[];
}

/** CAPEX devices of the region: Egypt shows device cards, KSA a list of documents (legacy). */
export function loadCapex(region: Region): Promise<CapexData> {
  return cached(`capex:${region}`, async () => {
    const [bus, specialties, rows] = await Promise.all([
      loadRegionBUs(region),
      loadSpecialties(),
      fetchAllRows(
        'cr18c_servhubcapexes',
        activeRowsFetch(
          'cr18c_servhubcapex',
          ['cr18c_servhubcapexid', 'cr18c_name', 'cr18c_devicestatus', 'cr18c_image', 'cr18c_descriptionen', 'cr18c_descriptionar', 'cr18c_iframeurl', 'cr18c_bun', 'cr18c_specialty'],
          regionCondition(region),
        ),
      ),
    ]);
    const buName = new Map(bus.map((bu) => [bu.id, bu.name]));
    const specialtyName = new Map(specialties.map((specialty) => [specialty.id, specialty.name]));
    return {
      items: rows
        .map((row) => ({
          id: text(row, 'cr18c_servhubcapexid'),
          name: text(row, 'cr18c_name'),
          url: text(row, 'cr18c_iframeurl'),
          status: num(row, 'cr18c_devicestatus'),
          imageUrl: text(row, 'cr18c_image'),
          descriptionEn: text(row, 'cr18c_descriptionen'),
          descriptionAr: text(row, 'cr18c_descriptionar'),
          buId: lookupId(row, 'cr18c_bun'),
          buName: buName.get(lookupId(row, 'cr18c_bun')) ?? formatted(row, 'cr18c_bun'),
          specialtyId: lookupId(row, 'cr18c_specialty'),
          specialtyName: specialtyName.get(lookupId(row, 'cr18c_specialty')) ?? formatted(row, 'cr18c_specialty'),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      bus,
      specialties: regionSpecialties(specialties, region).map(({ id, name }) => ({ id, name })),
    };
  });
}

const OFFICE_FILE = /\.(xlsx|xlsm|xlsb|xls|docx|docm|doc|pptx|pptm|ppt)$/i;

/**
 * Office Online embed view of a SharePoint Office document (used by the pop-up window, see
 * fileLinks.ts): Doc.aspx / sharing links get action=embedview, direct file links go through
 * WopiFrame.aspx. Other URLs are returned unchanged.
 */
export function embedUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!/(^|\.)sharepoint\.com$/i.test(url.hostname)) return raw;
  // Office Online page (Doc.aspx / WopiFrame.aspx / xlviewer) or a sharing link: ask for the embed view.
  if (/\/_layouts\/15\/(doc|doc2|wopiframe|wopiframe2|xlviewer)\.aspx$/i.test(url.pathname) || /^\/:[a-z]:\//i.test(url.pathname)) {
    url.searchParams.set('action', 'embedview');
    return url.toString();
  }
  // Direct link to an Office file: open it through Office Online in embed mode.
  const path = decodeURIComponent(url.pathname);
  if (OFFICE_FILE.test(path)) {
    const site = /^\/(?:sites|teams)\/[^/]+/i.exec(path)?.[0] ?? '';
    return `${url.origin}${site}/_layouts/15/WopiFrame.aspx?sourcedoc=${encodeURIComponent(path)}&action=embedview`;
  }
  return raw;
}

/** Opens a document in a new tab. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
````

## Page patterns

ServiceHub components that new pages should reuse: the Pills filter panel, Band info card, rich text rendering, and the Tiles choice.

### `src/screens/hub/HubCommon.tsx`

````tsx
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Copy, Filter, SearchNormal1, TickCircle } from 'iconsax-react';
import { sanitizeRichText } from '../../data/formatCell';
import { clearHubCache } from '../../data/hub/common';
import { useAsyncData } from '../../data/useAsyncData';
import { Dropdown } from '../Dropdown';
import { useDismiss } from '../useDismiss';

/** Loading / error / empty states shared by the Service Hub sections. */
export function HubLoading({ label }: { label: string }) {
  return (
    <div className="loader-box" role="status">
      <div className="loader-ring" />
      <div className="loader-text">{label}</div>
    </div>
  );
}

export function HubError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-title">{title}</div>
      <div className="empty-sub" dir="auto">{message}</div>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function HubEmpty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Single-choice filter (label + native select), the legacy "All …" dropdowns. */
export function FilterSelect({ label, value, allLabel, options, onChange }: { label: string; value: string; allLabel: string; options: readonly Option[]; onChange: (value: string) => void }) {
  return (
    <div className="hub-filter">
      <span className="field-lbl">{label}</span>
      <Dropdown ariaLabel={label} value={value} options={[{ value: '', label: allLabel }, ...options]} onChange={onChange} />
    </div>
  );
}

export interface MultiOption extends Option {
  /** Rendered indented under a group entry (e.g. the Alex hospitals). */
  child?: boolean;
  /** Group entry: toggles all `values` together. */
  values?: readonly string[];
}

/** Multi-choice dropdown (the legacy Business Unit filter). */
export function FilterMultiSelect({ label, allLabel, options, selected, onChange }: { label: string; allLabel: string; options: readonly MultiOption[]; selected: readonly string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const isSelected = (option: MultiOption) =>
    option.values ? option.values.length > 0 && option.values.every((value) => selected.includes(value)) : selected.includes(option.value);

  const toggle = (option: MultiOption) => {
    const values = option.values ?? [option.value];
    const next = isSelected(option) ? selected.filter((value) => !values.includes(value)) : [...new Set([...selected, ...values])];
    onChange(next);
  };

  return (
    <div className={`hub-filter dd${open ? ' open' : ''}`} ref={ref}>
      <span className="field-lbl">{label}</span>
      <button type="button" className="field-input dd-btn" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{selected.length === 0 ? allLabel : `${selected.length} selected`}</span>
        <span className="dd-arrow" aria-hidden="true">▼</span>
      </button>
      {open && (
        <div className="dd-menu dd-list" role="listbox" aria-multiselectable="true">
          {options.map((option) => (
            <label key={option.value} className={`dd-opt dd-check${isSelected(option) ? ' selected' : ''}${option.child ? ' child' : ''}${option.values ? ' group' : ''}`}>
              <input type="checkbox" checked={isSelected(option)} onChange={() => toggle(option)} />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="hub-filter hub-search">
      <span className="field-lbl">{label}</span>
      <span className="hub-search-wrap">
        <SearchNormal1 size={14} color="currentColor" aria-hidden="true" />
        <input className="field-input" type="search" dir="auto" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

/**
 * Filter panel ("Pills" design, user choice 2026-09-30): a header with the results count and
 * "Clear All Filters", then each filter as a rounded chip with its label inside; the search box
 * (and a Refresh button, when the page has one) comes last: at the end of the chips' row when it
 * fits, else on the next line.
 */
export function FilterPanel({ children, summary, canClear, onClear }: { children: ReactNode; summary: string; canClear: boolean; onClear: () => void }) {
  return (
    <div className="bento filter-panel">
      <div className="fp-head">
        <span className="fp-title">
          <Filter size={16} color="currentColor" variant="Bulk" /> Filters
        </span>
        <span className="hub-count" role="status">{summary}</span>
        <button type="button" className="btn btn-outline btn-sm fp-clear" disabled={!canClear} onClick={onClear}>
          Clear All Filters
        </button>
      </div>
      <div className="hub-filters">{children}</div>
    </div>
  );
}

/**
 * Lists and paragraphs without an explicit direction get dir="auto", so bullets sit on the side of
 * their own (Arabic or English) text — the legacy renderAsPoints rule. Runs on sanitized HTML.
 */
const autoDirection = (html: string) => html.replace(/<(ul|ol|li|p)(?![^>]*\bdir=)(?=[\s>])/gi, '<$1 dir="auto"');

/**
 * Stored rich text / plain text value, sanitized; plain text keeps its line breaks. `points` shows
 * plain text as one bullet per sentence, as the legacy COE / scripts cards did.
 */
export function RichBlock({ value, arabic, points }: { value: string; arabic?: boolean; points?: boolean }) {
  const isHtml = /<[a-z][\s\S]*>/i.test(value);
  if (!isHtml && points) {
    const sentences = value.split('.').map((line) => line.trim()).filter(Boolean);
    return (
      <ul className="rich-text hub-text" dir={arabic ? 'rtl' : 'auto'}>
        {sentences.map((line, index) => (
          <li key={index} dir="auto">{line}</li>
        ))}
      </ul>
    );
  }
  return isHtml ? (
    <div className="rich-text hub-text" dir={arabic ? 'rtl' : 'auto'} dangerouslySetInnerHTML={{ __html: autoDirection(sanitizeRichText(value)) }} />
  ) : (
    <div className="hub-text hub-pre" dir={arabic ? 'rtl' : 'auto'}>
      {value}
    </div>
  );
}

/**
 * A field value that may be stored as rich text (HTML) or plain text: HTML is shown formatted
 * (sanitized) instead of as raw tags, plain text as is.
 */
export function RichValue({ value }: { value: string }) {
  if (!/<[a-z][\s\S]*>/i.test(value)) return <>{value}</>;
  return <div className="rich-text rich-value" dangerouslySetInnerHTML={{ __html: autoDirection(sanitizeRichText(value)) }} />;
}

/** Label/value row inside a card (base.css kv-item). */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv-item">
      <span className="k">{label}</span>
      <span className="v" dir="auto">{children}</span>
    </div>
  );
}


/**
 * Loads cached hub data and renders it, with the shared loading / error (+ retry) states.
 * `cacheKey` is the `cached()` key used by the loader, cleared on retry.
 */
export function HubLoad<T>({ cacheKey, loader, label, children }: { cacheKey: string; loader: () => Promise<T>; label: string; children: (data: T) => ReactNode }) {
  const [reload, setReload] = useState(0);
  const data = useAsyncData(`${cacheKey}:${reload}`, loader);
  if (data.loading) return <div className="bento"><HubLoading label={`Loading ${label}…`} /></div>;
  if (data.error || data.data === undefined) {
    return (
      <div className="bento">
        <HubError
          title={`Couldn’t load ${label}`}
          message={data.error ?? ''}
          onRetry={() => {
            clearHubCache(cacheKey);
            setReload((count) => count + 1);
          }}
        />
      </div>
    );
  }
  return <>{children(data.data)}</>;
}

/** Code chip with a copy button (service / package codes are read out on calls). */
export function CopyChip({ value, label = 'code' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const copy = () =>
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => undefined,
    );
  return (
    <button type="button" className={`card-code${copied ? ' copied' : ''}`} onClick={copy} title={`Copy ${label}`} aria-label={`Copy ${label} ${value}`}>
      <span dir="ltr">{value}</span>
      {copied ? <TickCircle size={13} color="currentColor" /> : <Copy size={13} color="currentColor" />}
    </button>
  );
}

/** Icon + text line inside a card (business unit, specialty, address…). */
export function MetaItem({ icon, children, title }: { icon: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span className="card-meta-item" title={title}>
      <span className="card-meta-icon" aria-hidden="true">{icon}</span>
      <span dir="auto">{children}</span>
    </span>
  );
}

/** Large price with its currency; `before` is shown struck through. */
export function PriceTag({ value, currency, before, label = 'Price' }: { value: number | string | null; currency: string; before?: number | string | null; label?: string }) {
  const show = (amount: number | string) => (typeof amount === 'number' ? amount.toLocaleString() : amount);
  return (
    <div className="card-price">
      <span className="card-price-label">{label}</span>
      <span className="card-price-values">
        {before !== undefined && before !== null && before !== '' && (
          <s className="card-price-before">
            {show(before)} {currency}
          </s>
        )}
        {value === null || value === '' ? (
          <span className="card-price-amount na">N/A</span>
        ) : (
          <span className="card-price-amount">
            {show(value)} <small>{currency}</small>
          </span>
        )}
      </span>
    </div>
  );
}

export interface CardField {
  label: string;
  value: ReactNode;
  /** Highlight the value (prices). */
  strong?: boolean;
}

/** Labelled fields of a card, in the legacy web resource's order ("CODE: … PRICE: …"). Empty values show N/A. */
export function CardFields({ fields }: { fields: readonly CardField[] }) {
  return (
    <dl className="card-fields">
      {fields.map((field) => (
        <div key={field.label} className="card-field">
          <dt>{field.label}</dt>
          <dd dir="auto" className={field.strong ? 'strong' : undefined}>
            {field.value === '' || field.value === null || field.value === undefined ? (
              'N/A'
            ) : field.strong ? (
              <span className="card-pill">{field.value}</span>
            ) : typeof field.value === 'string' ? (
              <RichValue value={field.value} />
            ) : (
              field.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
````

### `src/screens/hub/InfoCard.tsx`

````tsx
import type { ReactNode } from 'react';
import { RichBlock } from './HubCommon';

/**
 * Shared record card of the Egypt Quick Links pages (Insurance, Booking Policy, QA Tips, CRM
 * Dictionary, Department Working Hours): a title, tags (BU, type…) and labelled sections.
 * "Band" design (user choice, 2026-09-30): teal header, sections as boxes side by side.
 */

export interface InfoSection {
  label: string;
  /** Text or rich text (HTML); empty shows a dash. */
  value: string;
  arabic?: boolean;
}

/** One card per row; `foldable` keeps the legacy folded cards (click the header to open). */
export function InfoCard({ title, tags, sections, foldable, open }: { title: string; tags: readonly (string | undefined)[]; sections: readonly InfoSection[]; foldable?: boolean; open?: boolean }) {
  const header = (
    <>
      <span className="info-title" dir="auto">{title || '—'}</span>
      <span className="info-tags">
        {tags.filter(Boolean).map((tag) => (
          <span key={tag} className="info-tag" dir="auto">{tag}</span>
        ))}
      </span>
    </>
  );
  const body: ReactNode = (
    <div className="info-sections">
      {sections.map((section) => (
        <div key={section.label} className="info-section">
          <div className="info-label">{section.label}</div>
          <div className="info-value">{section.value ? <RichBlock value={section.value} arabic={section.arabic} /> : <span className="hub-muted">—</span>}</div>
        </div>
      ))}
    </div>
  );
  const className = 'info-card info-band';
  if (foldable) {
    return (
      <details className={`${className} info-fold`} open={open}>
        <summary className="info-head">{header}</summary>
        {body}
      </details>
    );
  }
  return (
    <article className={className}>
      <div className="info-head">{header}</div>
      {body}
    </article>
  );
}
````

### `src/app/RegionModal.tsx`

````tsx
import { ArrowRight2 } from 'iconsax-react';
import { REGION_CURRENCY, REGION_LABEL, REGION_MARK, REGIONS, type Region } from './region';

interface RegionOptionsProps {
  current: Region | null;
  onSelect: (region: Region) => void;
}

/**
 * The EGY / KSA choice as tiles (the region code as a large watermark) — used on the Service Hub
 * landing and inside the modal.
 */
export function RegionOptions({ current, onSelect }: RegionOptionsProps) {
  return (
    <div className="rl-grid">
      {REGIONS.map((region) => (
        <button
          key={region}
          type="button"
          className={`rl-card${region === current ? ' current' : ''}`}
          aria-pressed={region === current}
          onClick={() => onSelect(region)}
        >
          <span className="rl-watermark" aria-hidden="true">
            {REGION_MARK[region]}
          </span>
          <span className="rl-top">
            <span className="rl-mark">{REGION_MARK[region]}</span>
            <span className="rl-title">
              <span className="rl-name">{REGION_LABEL[region]}</span>
              <span className="rl-code">{region}</span>
            </span>
          </span>
          <span className="rl-line">
            {region === current ? (
              'Current region'
            ) : (
              <>
                Business units and prices in <b>{REGION_CURRENCY[region]}</b>
              </>
            )}
          </span>
          <span className="rl-go">
            Open {REGION_LABEL[region]}
            <ArrowRight2 size={14} color="currentColor" />
          </span>
        </button>
      ))}
    </div>
  );
}

interface RegionModalProps extends RegionOptionsProps {
  onCancel: () => void;
}

/** Change-region dialog opened from the navbar region chip. */
export function RegionModal({ current, onSelect, onCancel }: RegionModalProps) {
  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="modal-box region-modal" role="dialog" aria-modal="true" aria-labelledby="region-modal-title">
        <div className="modal-hdr">
          <div className="modal-title" id="region-modal-title">Select Your Region</div>
          <div className="modal-sub">Choose a region to view doctors, services and offers</div>
        </div>
        <div className="modal-body">
          <RegionOptions current={current} onSelect={onSelect} />
          <button type="button" className="btn btn-outline btn-block" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
````

