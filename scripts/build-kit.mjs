// Builds CODE_APP_KIT.md: the playbook plus the full styles and the reusable source, in one file a
// new chat can read to build another system with the same design and behaviour.
// Run: node scripts/build-kit.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trimEnd();

// Load order matters (main.tsx imports them in this order).
const STYLES = [
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/app.css',
  'src/styles/synapse.css',
  'src/styles/hub-cards.css',
  'src/styles/service-card.css',
  'src/styles/doctor-card-styles.css',
  'src/styles/doctor-profile.css',
];

const PROJECT = ['package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'eslint.config.js', 'index.html', 'src/main.tsx', 'src/App.tsx', 'src/env.d.ts'];

// The generic engine: Dataverse gateway, live metadata, MDA views / lookups / forms, privileges,
// grid, form, export, pop-up file links, shell. ServiceHub-only parts (hub pages, regions, the
// legacy usage log, the generated label snapshot) are left out.
const ENGINE = [
  'src/data/config.ts',
  'src/data/dataverse.ts',
  'src/data/useAsyncData.ts',
  'src/data/columnMeta.ts',
  'src/data/columnPrefs.ts',
  'src/data/richTextColumns.ts',
  'src/data/views.ts',
  'src/data/fetchQuery.ts',
  'src/data/lookups.ts',
  'src/data/forms.ts',
  'src/data/records.ts',
  'src/data/related.ts',
  'src/data/recordActions.ts',
  'src/data/formatCell.ts',
  'src/data/permissions.ts',
  'src/data/exportExcel.ts',
  'src/data/fileLinks.ts',
  'scripts/build-column-labels.mjs',
  'src/app/AppShell.tsx',
  'src/app/navigation.ts',
  'src/app/preferences.ts',
  'src/app/PermissionsProvider.tsx',
  'src/app/permissionsContext.ts',
  'src/app/useCurrentUser.ts',
  'src/screens/TableScreen.tsx',
  'src/screens/PageHeader.tsx',
  'src/screens/RecordForm.tsx',
  'src/screens/ColumnPicker.tsx',
  'src/screens/Dropdown.tsx',
  'src/screens/useDismiss.ts',
  'src/screens/grid/ViewGrid.tsx',
  'src/screens/grid/ColumnMenu.tsx',
  'src/screens/grid/ColumnFilterPopover.tsx',
  'src/screens/grid/FilterEditor.tsx',
  'src/screens/grid/LookupValuesPicker.tsx',
  'src/screens/grid/BulkEditDialog.tsx',
  'src/screens/grid/ConfirmDialog.tsx',
  'src/screens/grid/SaveViewDialog.tsx',
  'src/screens/grid/useToasts.tsx',
  'src/screens/form/FieldEditor.tsx',
  'src/screens/form/PrincipalPicker.tsx',
  'src/screens/form/RecordDialogs.tsx',
  'src/screens/form/RichTextEditor.tsx',
  'src/screens/form/RichTextField.tsx',
  'src/screens/form/SubgridView.tsx',
  'src/screens/form/values.ts',
];

// ServiceHub files the engine still imports; the new system keeps the parts it needs.
const SUPPORT = ['src/app/region.ts', 'src/app/regionContext.ts', 'src/app/RegionProvider.tsx', 'src/app/hubSections.ts', 'src/data/hub/common.ts', 'src/data/hub/library.ts'];

// Reusable page components (cards, filter panel, rich text) shown as patterns to copy.
const PATTERNS = ['src/screens/hub/HubCommon.tsx', 'src/screens/hub/InfoCard.tsx', 'src/app/RegionModal.tsx'];

const LANG = { css: 'css', ts: 'ts', tsx: 'tsx', js: 'js', mjs: 'js', json: 'json', html: 'html' };
const block = (path) => `### \`${path}\`\n\n\`\`\`\`${LANG[path.split('.').pop()] ?? ''}\n${read(path)}\n\`\`\`\`\n`;
const appendix = (title, intro, paths) => `## ${title}\n\n${intro}\n\n${paths.map(block).join('\n')}`;

const header = `# Code App Kit: build a new system with the same design and behaviour

**How to use this file (for the assistant in a new chat):**

1. Read Part 1 (the playbook) completely before writing code. It holds the rules, the decisions the user already made and the mistakes not to repeat.
2. Create the project the way Part 1 §1 says (\`pa\` CLI, Vite, React, TypeScript), then copy the files in Parts 2–4 to the **same paths**.
3. Change only what belongs to the new system: the org URL and MDA app id in \`src/data/config.ts\`, the generated data sources (\`src/generated\`, \`.power/schemas\` come from \`pa\`, never hand-edit them), and the pages and tables of the new system. Remove the ServiceHub-only imports from \`AppShell.tsx\` (the Service Hub screen, regions).
4. Keep the styles exactly (Part 2) so the look is identical: Synapse teal tokens, Urbanist font, Band cards, Pills filters, Segment nav, Tiles.
5. Work with the user as Part 1 §9 says: Egyptian Arabic replies, short and simple; designs offered in the page with a switcher; every push only after an explicit OK.

**Bootstrap a new system (in this order):**

1. \`npm create vite@latest <name> -- --template react-ts\`, then replace \`package.json\`, \`vite.config.ts\`, the \`tsconfig*.json\`, \`eslint.config.js\`, \`index.html\`, \`src/main.tsx\`, \`src/App.tsx\`, \`src/env.d.ts\` with Part 3, and \`npm install\`.
2. \`./node_modules/.bin/pa auth\` (sign in), then \`./node_modules/.bin/pa app init\` in the **app** environment. That writes \`power.config.json\`.
3. Add the generic Dataverse connector (it creates \`src/generated/**\`, which the data layer imports as \`MicrosoftDataverseService\`): \`./node_modules/.bin/pa app add data-source --connector dataverse --table <any table> --org-url <data org url>\`. Every call then goes through the \`*WithOrganization\` operations with \`DATA_ORG_URL\` (Part 1 §2–3), so one connector serves every table.
4. Copy Parts 2 and 4 to the same paths. Set \`DATA_ORG_URL\` and \`MDA_APP_ID\` in \`src/data/config.ts\` (or \`.env.development.local\` for dev).
5. \`npm run labels\` creates \`src/data/columnLabels.generated.ts\` (the column snapshot; live metadata is merged over it at run time).
6. Replace the ServiceHub-only parts (Part 4 "Supporting" files: regions, hub sections) with the new system's pages; the sidebar, tables, views, forms, lookups and privileges come from the MDA app by itself.
7. \`npx tsc -b\`, \`npx eslint src\`, \`npm run build\`, then \`npm run dev\` and open the Local Play link. Push only with the user's OK: \`./node_modules/.bin/pa app push --solution-id <solution>\`.

**Not in this file (supply or recreate):** \`src/generated/**\` and \`power.config.json\` (made by \`pa\`), \`columnLabels.generated.ts\` (made by \`npm run labels\`), binary assets (the doctor photo, the region map render \`region-disc.jpg\`: images can't live in Markdown; the region landing component \`RegionMap.tsx\` is ServiceHub-specific and described in Part 1 §8.2).

Generated from the ServiceHub repo (https://github.com/Ahmed-Samir44/ServiceHubCodeApp) by \`scripts/build-kit.mjs\`. ${new Date().toISOString().slice(0, 10)}.

---

# Part 1. Playbook

`;

const playbook = read('CODE_APP_PLAYBOOK.md').replace(/^# .*\n/, '');

const out = [
  header + playbook,
  '\n---\n\n# Part 2. Styles (copy as is)\n',
  appendix('Style sheets', 'Import them in this order in `src/main.tsx`, after the Urbanist (400/500/600/700) and JetBrains Mono (400/600) `@fontsource` imports. Everything is scoped under `.servhub-app` (rename the class if you like, everywhere at once).', STYLES),
  '\n---\n\n# Part 3. Project setup files\n',
  appendix('Config and entry', 'Install the same packages (`npm install`); `@microsoft/power-apps` and the `pa` CLI come from `pa init`.', PROJECT),
  '\n---\n\n# Part 4. Reusable source\n',
  appendix('Engine (data layer, grid, form, shell)', 'Generic: works for any Dataverse table that the MDA app exposes. It reads the MDA sitemap, views, forms, lookups and privileges live.', ENGINE),
  appendix(
    'Supporting ServiceHub files (trim to what the new system needs)',
    [
      'The engine imports these. What it actually uses:',
      '',
      '- `app/region.ts` + `regionContext.ts` + `RegionProvider.tsx`: a two-value scope (Egypt / KSA) that picks the default view and filters hub data. Keep it if the new system has a similar scope; otherwise remove the region imports from `views.ts`, `TableScreen.tsx`, `ViewGrid.tsx` and `AppShell.tsx`.',
      '- `app/hubSections.ts`: the Service Hub sections, used by `AppShell.tsx` for the hub entry. Replace with the new system\'s pages.',
      '- `data/hub/common.ts`: `clearHubCache` and small row helpers used by `HubCommon.tsx`.',
      '- `data/hub/library.ts`: only `embedUrl` and `openInNewTab` are needed by `fileLinks.ts`; the rest (ServiceHub document tables, and its `./specialties` import) can go.',
      '- `src/generated/*` is produced by `pa add data-source`; `src/data/columnLabels.generated.ts` by `npm run labels` (`scripts/build-column-labels.mjs`).',
    ].join('\n'),
    SUPPORT,
  ),
  appendix('Page patterns', 'ServiceHub components that new pages should reuse: the Pills filter panel, Band info card, rich text rendering, and the Tiles choice.', PATTERNS),
].join('\n');

writeFileSync(new URL('../CODE_APP_KIT.md', import.meta.url), `${out}\n`);
console.log(`CODE_APP_KIT.md: ${Math.round(out.length / 1024)} KB`);
