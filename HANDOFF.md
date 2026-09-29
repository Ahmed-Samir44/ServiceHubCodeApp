# ServiceHub — Handoff Notes

Read this first when continuing the work in a new chat. It is the single source of context. Update the **Status** section whenever something is finished.

## 0. REMAINING WORK — PLAN (as of 2026-09-29; start here)

Do these in order. Tick them off here as you finish.

**Phase 1: real-data verification (the user tests in Local Play; fix whatever breaks)**
- [ ] Hub pages on real data, EGY and KSA. Highest risk (never run live):
  - Upcoming Offers: `new_plannedoffers` with `new_planvalidity` / `new_hasfinalapproval`.
  - KSA offer lookups: `crd04_specialtieses` and `new_offertypes`.
  - Scripts: `cr301_categories`, `cr301_subcategories`, `cr301_scriptses` (`cr18c_regionchoice`).
  - Doctor exceptions: `cr301_doctorexceptionreasons` and its lookup name.
  - Service categories: `cr301_servicecategoryksa_service_hubs`.

  If a page errors, check the entity set / attribute names against `reference/dataverse-schemas` and the legacy code.
- [ ] Table pages on real data:
  - Create, update and delete.
  - Privilege hiding.
  - Quick Find.
  - Subgrids.
  - Rich text.
  - The new Dropdown inside **Edit filters** (a modal; check it isn't clipped).
  - The Search box icon fix.
- [ ] EGY location photos. **Blocked on the user/IT:** read access to the EgyProductServices SharePoint site, or photos moved to /sites/Apps/SiteAssets with the Image column updated. No code work needed.

**Phase 2: missing legacy features (code; can be done without the user)**
- [ ] **Page usage logging:** the legacy `logPageUsage(screenId)` (region.html ~5970) wrote to `cr301_canvaspageusagelogs` on each screen open. Replicate it from ServiceHubScreen on section change: fire-and-forget `createRow`, never block the UI, and read the legacy fields first.
- [ ] **Clinic names on doctor cards / profile as links** to the Procedure Clinic hub (the legacy `openProcedureClinicHub`). This needs a HubPreset with a clinic (see `HubPreset` in ServiceHubScreen). EGY only.

**Phase 3: engineering hygiene**
- [ ] `git init` plus a first commit. The project is NOT under version control. Ask the user before creating a remote.
- [ ] Code-split the big bundle (>500 kB): lazy-load `TableScreen` and the hub sections with `React.lazy`.

**Phase 4: publish**
- [ ] Remove `src/DevPreview.ts` if present, then `npm run build`, then **ask the user**, then `./node_modules/.bin/pa app push`. Then have the user test in the real player (not Local Play).

**Phase 5: optional (only if the user asks)**
- Redesign the remaining hub cards (Programs, Quick Links cards, Bank, Home Care). Always offer 2–3 options via an in-page switcher and let the user pick.
- MDA gaps on table pages: business rules, quick create, form switcher, autosave, lookup "Equals" filter.

## 1. What the project is

**ServiceHub** is a Power Apps **Code App** (React 19 + TypeScript strict + Vite 7, `@microsoft/power-apps` 1.2.5). It replaces two things:

1. **The model-driven app (MDA) table experience.** The sidebar lists the MDA sitemap tables. Each table page works like a Dataverse grid and form, with full CRUD. This part is DONE.
2. **The legacy D365 web resource `region.html`** ("Doctor Management System"). In the app it is the **"Andalusia Service Hub"** page: region selection, then the legacy top nav (Doctors, Services, Packages, …). This part is IN PROGRESS (see Status).

The legacy source is saved at **`reference/legacy/region.html`** (≈15k lines). Always read the matching legacy function before building a page, and keep its logic and wording. Do not port its bugs (listed below).

## 2. Environments (cross-environment!)

| | Org | Env id |
|---|---|---|
| **Data** (all tables) | `https://org319b4ea9.crm4.dynamics.com` | 9ce6fb09-5b63-e9f4-9185-b707b4b3425e |
| **App host** | `https://org998df960.crm4.dynamics.com` | cd78a59b-e16f-e4aa-b0a1-8e450a70ed56 |

- All data access goes through the generic Dataverse connector (`src/generated`, `MicrosoftDataverseService.*WithOrganization`), wrapped by `src/data/dataverse.ts` (`listRows`, `createRow`, `updateRow`, `deleteRow`, `runAction`). `DATA_ORG_URL` is in `src/data/config.ts`.
- CLI: `./node_modules/.bin/pa` (0.15.2). The global `pac` on this machine is an unrelated tool, so don't use it.

## 3. User rules (must follow)

- **Never run `pa app push` without the user's explicit OK each time.**
- Give screenshot proof for UI changes (Playwright, see §7).
- No `any`, and don't hand-edit `src/generated`.
- **Design = Synapse/HMIS design system** (user decision 2026-09-29; this reverses the earlier gold/green choice).
  - It is implemented in `src/styles/synapse.css`, loaded last in `main.tsx`. That file holds the `--ds-*` tokens, the legacy variables re-pointed at them, and the sizing contract: Urbanist, 14px body/tables/labels, 40px table rows, 44px fields, 40/32px buttons, radius 8/16, teal focus ring, deep-teal shell.
  - `tokens.css` and `base.css` stay untouched underneath: class names come from base.css, and colors and sizes come from synapse.css. Hub-specific styles live in `app.css`.
  - In dark mode, restate in synapse.css's `.servhub-app.dark` block every variable that tokens.css `.servhub-app.dark` sets, because that selector out-ranks the light mapping.
  - Lanes: system UI = teal, analytics/KPIs = gold, genuine AI only = purple. Never hard-code colors; use `--ds-*`.
  - The Synapse source is in `C:\Users\ahmed-amin\Downloads\synapse-design-system\hmis-design-system\src\design-system\`.
  - Layout rules are unchanged: **cards** in hub pages, **MDA-like grids** on table pages.
- The user writes in Egyptian Arabic, so reply in Arabic, short and clear.
  - Don't pester with questions; decide sensible defaults and keep going.
  - The user gets frustrated by many permission prompts and unexplained steps.
- `npx tsc -b && npx eslint src` must be clean before reporting done.

## 4. Architecture map

- `src/App.tsx`: `RegionProvider` › `PermissionsProvider` › `AppShell`.
- `src/app/`:
  - `region.ts`: `Region` 'EGY'|'KSA', REGION_CHOICE_VALUE EGY=983080000 / KSA=983080001, REGION_CURRENCY LE/SAR.
  - `RegionProvider`: sessionStorage `selectedRegion`.
  - `navigation.ts`: sidebar = MDA sitemap tables.
  - `hubSections.ts`: legacy top-nav sections, per-region headings, EGY-only/KSA-only sections, groups `quick-links` / `health-libraries`.
  - `AppShell.tsx`: sidebar filtered by read privilege.
- **Table pages (done):**
  - `src/screens/TableScreen.tsx`, `grid/*`, `RecordForm.tsx`, `form/*`.
  - Views, filters, sort, quick find, column resize/picker, bulk edit, assign/share, export, and a TipTap rich-text editor.
- **Service Hub pages:**
  - `src/screens/ServiceHubScreen.tsx` has a `switch` in `HubSectionContent` mapping each section id to a component in `src/screens/hub/*`. Unbuilt sections fall back to `SectionPlaceholder`.
- **Hub data layer**, `src/data/hub/`:
  - `common.ts`:
    - Data helpers: `fetchAllRows` (FetchXML paging, 5000/page), `activeRowsFetch(entity, attrs, extraFilterXml)`, and the field readers `text/num/lookupId/formatted`.
    - Cache helpers: `cached(key, loader)` and `clearHubCache(prefix)`.
    - `loadRegionBUs(region)`: businessunit with `cr603_application_tag` contain-values 999740008, linked to `crd04_regions` via `crd04_id`.
    - FetchXML builders: `xmlValue`, `idCondition`, `searchCondition`.
    - `foundText(count, noun, plural?)`.
  - `specialties.ts`:
    - Loaders: `loadSpecialties()` (all), `loadSpecialtyMappings()`, `loadSpecialtyDetails()`.
    - Helpers: `regionSpecialties()`, `equivalentSpecialtyIds()`.
  - `doctors.ts`: `loadDoctorsData(region)` + helpers (the visibility rule, KSA specialty mapping, exceptions, clinics, `doctorHasClinic`).
  - `services.ts`: server-side filtered/paged query (60 per page). Packages = category named "Package".
  - `centers.ts`: COE + Locations.
  - `clinics.ts`: Procedure Clinics + Bank Accounts.
  - `offers.ts`: EGY offers, KSA offers (status 100000001), and KSA upcoming offers (planned offers joined to their originals).
  - `programs.ts`: Programs + Home Care.
- **Hub UI helpers:**
  - `src/screens/hub/HubCommon.tsx`: `HubLoading/HubError/HubEmpty`, `FilterSelect`, `FilterMultiSelect` (group option), `SearchField`, `FilterPanel` (summary + Clear All Filters), `RichBlock` (sanitized HTML with dir=auto; `points` splits plain text by '.'), `InfoRow`.
  - `usePagedQuery.ts` and `useDebounced.ts`.
- **Hub CSS:** in `app.css` under "Andalusia Service Hub sections".
  - Classes: `hub-grid`, `hub-card`, `hub-fold` (details/summary), `hub-tiles`, `hub-flag` (exception tooltip).
  - Note: `--surface-1` exists only in dark mode, so always use `var(--surface-1, #fff)`.
- **React patterns:**
  - `useAsyncData(key, loader)` from `src/data/useAsyncData.ts`: results are keyed, so there is no setState-in-effect.
  - Reset a section's state by giving it a `key` (sections are keyed by id + region).
  - Lint rule: component files may export only components, so put helpers in `src/data/...`.

## 5. Service Hub status

| Section | Status | Notes |
|---|---|---|
| Doctors | ✅ built + mock-tested | Details below the table |
| Services / Packages | ✅ | BU, Specialty (with equivalent-specialty expansion), Category (services only), search, price sort. Fixed legacy bug: sort was by title |
| Specialties | ✅ | Only specialties with doctors. BU filter matches `servhub_butxt` names. Hub tiles: Doctors / Services / Packages / Offers / Details. Details = notes by BU, general details (region or null) and value proposition |
| COE | ✅ | Foldable cards; region via BU. Fixed: value proposition was never selected in legacy |
| Locations | ✅ | Region text contains the code; Maps link; image hidden if broken |
| Procedure Clinics (EGY) | ✅ | Clinic list → hub (Doctors via `DoctorsSection clinicName`, Details per BU) |
| Bank Accounts (KSA) | ✅ | BU → bank → account card with copy buttons |
| Offers | ✅ | EGY: newofferdataset with Expiry filter. KSA: offer requests + "Upcoming Offers" view. From the specialty hub, KSA matches specialty by name (as legacy did) |
| Programs | ✅ | Foldable cards; filters BU, Specialty, Level, search. Fixed: Services Included is now selected |
| Home Care | ✅ | BU → Knowledge Base (document viewer + open in new tab) or Scripts (category → sub-category → script) |
| Quick Links: Scripts & Knowledge | ✅ | Category → sub-category. EGY: foldable cards + BU filter. KSA: table (Tag/Name/Notes/Script/Order) |
| Quick Links: Insurance, Booking Policy, QA Tips, CRM Dictionary, Working Hours | ✅ | EGY = cards with filters; KSA = `DocumentPicker` (buttons + embedded document). Choice labels come from formatted values (`quickLinks.ts`) |
| Quick Links: Events, Installments, Special Handling (KSA), System Links (new tab) | ✅ | `DocumentsSection` in `LibrarySections.tsx` |
| Health Libraries: CPGs, CAPEX, Other Health Info | ✅ | CPGs = cards + viewer. CAPEX EGY = device cards, KSA = documents |

**All 24 sections are built.** `ServiceHubScreen` has an exhaustive `switch`, so a new `HubSectionId` won't compile until it gets a screen. All were tested on mock data (both regions); they are **not yet verified on real data**.

**Doctors details:**
- A doctor is visible only with an OPD fee row (`servhub_opdflag` or `cr18c_manualopdflag` = 'OPD'; a manual flag of 'NONE' hides the row) in a region BU.
- BU multi-select with the Egypt "Alex" group (ash/smh/arc/aac/asc).
- Specialty uses the KSA mapping; the sub-specialty list depends on the specialty; Degree filter.
- EGY: First Priority + Exclusiveness. KSA: Contract + Star.
- Search in English and Arabic.
- Cards show fee badges with 🥇 first, the 🚩 exceptions tooltip, and EGY clinics.
- Profile page.
- Props: `initialSpecialtyId` and `clinicName`.

**Legacy functions to read for the remaining pages** (line numbers in `reference/legacy/region.html`):
- Scripts: loadCategories 7027, loadSubCategories 7047, loadScripts 7070, EGY scripts 7104–7175 / 10043–10263, navigateToScripts 10590.
- Insurance: 11742–11960.
- Booking policy: 11960–12176.
- QA tips: 12176–12392.
- CRM dictionary: 12392–12554.
- Working hours: 12554–12797.
- System links: 12797–12873.
- Events: 12873.
- Installments: 12966.
- Special handling: 13055.
- CPGs: 13422–13608 (iframe viewer).
- CAPEX: 13608–13819.
- Other health info: 13819–13923.
- Screen markup: search `id="<name>Screen"`.

Column names and types for ~30 tables are in `src/data/columnLabels.generated.ts` (short keys: l label, k kind, o options). Quick lookup:

```
node -e 'const s=require("fs").readFileSync("src/data/columnLabels.generated.ts","utf8");const j=s.slice(s.indexOf("{",s.indexOf("COLUMN_META")),s.lastIndexOf("}")+1);const m=JSON.parse(j);console.log(Object.keys(m.TABLE_LOGICAL_NAME))'
```

**Legacy bugs NOT to port:**
- openMediaContent is undefined.
- Clinic-doctor fees look up the wrong BU table.
- Programs render servicesincluded without selecting it.
- `$top` caps without paging.
- Unsanitized innerHTML.
- COE value proposition is never selected.
- Services "sort by price" actually sorts by title.
- KSA formula dates are misparsed.

**Display preferences** (`src/app/preferences.ts`, localStorage):
- **Text size.** The navbar has an A / A / A toggle: Normal 1.0 (the default since Synapse, whose 14px base equals the old "Large"), Large 1.15 and Extra large 1.3. It is applied as CSS `zoom` on `<main>`; the sidebar is not zoomed.
  - Anything fixed-positioned from `getBoundingClientRect` inside main must divide by `cssZoom(el)` (done for the grid column menu and column resize).
- **Doctors per row.** 2, 3 or 4, default **4** (user request 2026-09-29, default changed to **4** later that day). Cards are capped at 350px (`DOCTOR_CARD_MAX`) and use the legacy layout: round photo `servhubdoc.png` on top with an icon fallback, centred names, and fees one per line and larger. Narrow screens fall back to auto-fit.

## 6. Other pending work

- Verify on real data after the hub is done:
  - the new pages;
  - writes, permissions, Quick Find, subgrids and rich-text detection on table pages.
- The mock harness is **not** in `src/` now (so Local Play shows real data). A copy with mock rows for every hub table is saved at `reference/dev/DevPreview.ts` (Playwright smoke test: `reference/dev/hub-smoke-test.mjs`, needs playwright-core installed somewhere, e.g. the scratchpad). To test again, copy it to `src/DevPreview.ts` and add `import './DevPreview'` in `src/main.tsx` before `import App`. **Remove both again before handing back or pushing.**
- Before a push: run `npm run build`, then ask the user before `pa app push`.
- Real-data risks to check first:
  - Entity set / attribute names never tested live: `new_plannedoffers` (new_planvalidity, new_hasfinalapproval), `crd04_specialtieses`, `new_offertypes`, `cr301_categories`, `cr301_doctorexceptionreasons`, `cr301_servicecategoryksa_service_hubs`.
  - External sites may refuse to be framed; users can still use "Open in new tab".
- Nice-to-have:
  - Clinic names on doctor cards linking to the clinic hub (the legacy page did this).
  - MDA gaps: business rules, lookup "Equals" filter, quick create, form switcher, autosave.

## 7. Testing procedure (mock + screenshots)

1. `src/DevPreview.ts` (restore it from `reference/dev/DevPreview.ts`, see §6) is a temporary mock gateway (`setPreviewGateway`, `setPreviewPrivileges(ALLOW_ALL)`) with fake rows per entity set. It is imported in `src/main.tsx` as `import './DevPreview'`. Add mock rows for any new table.
2. A dev server usually runs on `http://localhost:5182` (plain `npx vite --port 5182`). If the port is busy, it is already running.
3. Playwright scripts live in the session scratchpad `…/scratchpad/pw/shotsNN.mjs`. They use playwright-core with Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Run them with `node shotsNN.mjs ../shotsNN`, then view the PNGs.
4. Gotchas:
   - Writing regex/backslashes through bash heredocs strips `\`, so use the Write/Edit tools for such code.
   - Local Play (`npm run dev` with the Power Apps plugin) is what the user uses with real data.

## 8. Memory

The Claude memory dir `C:\Users\ahmed-amin\.claude\projects\c--Users-ahmed-amin-servicehub-codeapp\memory\` holds short notes. **This file is the detailed handoff.**

## 9. Lessons from real data (Local Play)

- **Lookup names:** a lookup id may not be in the list we load (e.g. an inactive specialty), which showed as "N/A". Always keep the row's own formatted name (`formatted(row, 'lookup_attr')`) as a fallback. This is done for services (specialty, BU, category) and doctors (specialty, degree, nationality).
- **Filter panel overflow:** a wide control in the `hub-filters` grid pushed the whole page sideways. Grid children now get `min-width: 0`, wide controls use `.hub-filter-wide` (spans 2 columns), and `.main` has `overflow-x: clip`. Checked at 1100–1920px widths with all three text sizes.
- **Dropdowns:** there are no native `<select>`s anywhere. Use `src/screens/Dropdown.tsx`, a single-select with search when there are more than 8 options, groups and keyboard support, styled like the Doctors BU multi-select (`dd-*` classes in synapse.css). The hub `FilterSelect`, form choice fields, grid filter editor and View picker all use it.
- **Scrollbars:** thin with a teal thumb (`.servhub-app *` in synapse.css, plus the page scrollbar via `html:has(.servhub-app)` in app.css, colours only). The sidebar scrollbar stays hidden.
- **Edges:** `.servhub-app` uses negative margins on all sides to cancel the host page's default 8px body margin (base.css did left/top; app.css adds right/bottom). `html:has(.servhub-app)` gets the canvas background and scrollbar-track colour, so there's no white strip. Never restyle body.
- **Card system** (`src/styles/hub-cards.css`, loaded after synapse.css):
  - Shared pieces from `HubCommon`: `CopyChip` (copyable code), `MetaItem` (icon + text), and `PriceTag` (large price, with an optional struck-through "before" price).
  - Services/Packages and Offers use `.sc-card`. Specialties use `.sp-card` (letter avatar, doctor count, BU tags).
  - COE shows one center per row (`.coe-card`, with scripts side by side when opened). Locations use `.loc-card`: cover photo over a placeholder, and an "Open image" button if the photo fails.
- **Images** stored as links go through `imageUrl()` in `src/data/hub/images.ts`. It adds a missing https, pulls the src out of an `<img>` in HTML, and converts Google Drive, Dropbox and SharePoint share links.
  - In dev, a failed location photo logs `[locations] image did not load` with the stored value. Ask the user for that console line if photos still don't show.
- **Cards must keep every legacy field with its label** (user feedback 2026-09-29: icons instead of labels read as 'less information'). Use `CardFields` from HubCommon (label + value rows in the legacy order: Services = Code, Price, Business Unit, Specialty, Category). Extras like the copy button are fine, but never drop labels or fields.

- **Service/Package card** (`src/styles/service-card.css`, `.svc-*`): header with a category icon (Radiology = scan, Lab = microscope, Procedure = scissor, Package = box, otherwise health) and the category/kind above the title, a teal Arabic name, labelled 2-column field tiles (Code full width with copy, Business Unit | Specialty, Category), and a price band at the bottom.
- **Doctor card = Split** (user choice 2026-09-29; Classic/Tiles/List were removed).
  - Structure: a names block (photo, names, 🚩) and details (labelled `CardFields`, consultation-fee table, full-width btn-primary "Visit Doctor Profile" like the old Classic).
  - Layout: side by side on wide cards, stacked below 440px via a container query. CSS is in `doctor-card-styles.css`.
  - Names block is **White** (user choice 2026-09-29): a teal photo ring and a divider line. The colour trial was removed.
  - The user asked to be offered several designs to choose from; keep doing that.
- **Specialty hub:** opening a specialty shows the Doctors/Services/Packages/Offers tiles and, directly below, the legacy Details (Important Notes by BU, open when there are 3 or fewer BUs; General Details; Value Proposition). There's no separate Details tile anymore (user request 2026-09-29).
- **Specialty cards:** text only, with a teal accent bar and a doctor count. The letter avatar and the servhub_butxt BU tags were removed at the user's choice (2026-09-29).
- **COE card v2:** empty fields and blocks are hidden. Members, Arabic Script, Value Proposition and Clinic Booking Process each take a full-width row. Header fields are **Pills** ("LABEL: value" capsules; user choice 2026-09-29). The layout trial was removed.
- **Locations without a photo:** the **Map** look (light map grid + teal pin; user choice 2026-09-29). The trial and the Open image button were removed. **Cause of the missing EGY photos:** their Image column holds a SharePoint AccessDenied.aspx URL, not the image. `imageUrl()` now extracts the real file from `Source=` (a list attachment on the EgyProductServices site). That only loads for users with access to that site; the real fix is data: upload the EGY photos to /sites/Apps/SiteAssets like KSA and store direct URLs.
- **Context bar** (`.ctx-bar`): lists opened from a specialty hub show "DOCTORS · Orthopedics" plus "Open in Doctors Directory / Services / Packages / Offers". That button opens the main section with the specialty preset (`HubPreset` in ServiceHubScreen; clicking the nav clears it). Clinic doctors show the bar without the button, since the directory has no clinic filter. Decided with the user 2026-09-29: keep the in-context lists (better than the legacy jump) and add this bar.
- **Doctor profile = Sidebar** (user choice 2026-09-29): a sticky side card (photo, names, exceptions, BUs, fee table BU × Original/Affiliate/Contract/Walk-in) and main sections (Basic Information tiles, Scope, Qualifications, Notes). CSS in `doctor-profile.css`.
- **Rich text anywhere:** field values can be stored as HTML. Always render values through `RichValue` (HubCommon) or `RichBlock`, never as plain strings. `CardFields`, profile tiles and COE fields already do this (user reminder 2026-09-29).
- **Back links** (`.back-link`) are pills: white, teal text, turning light teal on hover (synapse.css).
- **Grid filters = model-driven behaviour** (2026-09-29):
  - The column menu's "Filter by" opens a callout under the header (`ColumnFilterPopover`: operator + value, Apply / Clear). Column filters are ANDed with the view / edited filter.
  - Filtered columns show a filter icon, and their menu gets "Clear filter".
  - "Edit filters" is a right-side panel (it absorbs the column filters on Apply). A "Clear filters" button appears when any filter is active.
  - The mock (`reference/dev/DevPreview.ts`) now has a savedquery for New Doctor Datasets and records `window.__lastFetch`.
- **SharePoint in iframes (trial, 2026-09-29):** SharePoint refuses to be framed by the code-app host (the legacy page worked because it ran inside Dynamics). `embedUrl()` in `data/hub/library.ts` now turns Office files on SharePoint into `WopiFrame.aspx?sourcedoc=…&action=embedview` (and Doc.aspx / sharing links get `action=embedview`); every https document opens in the in-page viewer, which always keeps "Open in new tab" plus a hint. **Unverified on real data.** If embedview is also refused, go back to new-tab for SharePoint (make `canEmbed` false for sharepoint.com).
- **Back button** looks like the light outline button (rectangular, bordered), not a pill (user feedback: the pill read like a label).
- **Lookup filter Equals / Does not equal = MDA:** `LookupValuesPicker` searches the lookup's table by name, and you pick one or more records as chips. It is written as eq/ne (one record) or in/not-in (several) with `<value uiname uitype>`, so saved views keep the names; parsing maps in/not-in over named records back to Equals/Does not equal. Lookups default to Equals in the column callout. The user expects *everything* on table pages to behave exactly like the model-driven app.
- **View options removed** (user request 2026-09-29): no Save as new view / Save changes / Set default / Delete view in the UI anymore; that code was deleted from ViewGrid. The saved default view in localStorage is still read. **Column menu** has "Clear sort" on the user-sorted column. **Search this view** runs on Enter (like the MDA), over the table's Quick Find columns, 'begins with' by default and *text for contains.
- **Export to Excel = MDA-like typed cells** (`data/exportExcel.ts`): numbers as Excel numbers, dates as Excel dates (dd/mm/yyyy, plus the time when it isn't midnight), choices/lookups as names, rich text converted by `htmlToText` (one line per paragraph, bullets as "• ", wrapped cell), capped at 32,767 characters per cell.
- **SharePoint files shown in-page (2026-09-29):**
  - Setup: added the SharePoint connector (connection `cc618fd7fa3440ebb6b6cc28d700582e`, the user created it in the maker portal) via `pa app add data-source --connector shared_sharepointonline --dataset https://andalusiagroupegypt.sharepoint.com/sites/Apps --table AllCPGs`. The table is only needed by the CLI.
  - `src/data/sharepointFiles.ts` declares the connector action **GetFileContentByPath** under data source `allcpgs` (not in generated code) and reads the file's **latest content** on each open.
  - `SharePointFileViewer` renders xlsx/xlsm as tables (one tab per sheet, read-excel-file, MIT), PDF via a blob iframe, and images inline. It has a Refresh button.
  - Used by DocumentViewer (Events, Installments, Special Handling, CPGs, CAPEX, KSA quick links) and Home Care KB.
  - Other types, sharing links (/:x:/…) and Doc.aspx?sourcedoc={GUID} fall back to the embedview iframe plus "Open in new tab".
  - **Unverified on real data:** the response format of the binary (base64 / $content / bytes is handled), and whether Local Play asks for the new connection consent. The dev console logs `[sharepoint] file …`.
- **SharePoint file reading, current state (2026-09-29):**
  - Uses the connector **HttpRequest** (not GetFileContentByPath). It tries, in order: GetFileById (sourcedoc={GUID} or d=w<hex>), then GetFileByUrl(full link), then GetFileByServerRelativePath.
  - The SDK keeps ONE dataSourcesInfo (first registered wins), so `sharepointFiles.ts` adds the HttpRequest api onto the generated `dataSourcesInfo.allcpgs.apis` at load.
  - Local Play must be fully reopened after power.config changes (it caches connection references).
  - **Company files are encrypted / sensitivity-labelled** (they start with D0 CF 11 E0), so they can't be parsed in the browser. For those the viewer asks SharePoint for a PDF rendering (`_api/v2.0/…/content?format=pdf`, first by item id, then via `shares/u!<base64url(link)>`) and shows the PDF. **Not yet confirmed to work.** If it fails, the only options are the new tab, or unprotected copies of the sheets.
