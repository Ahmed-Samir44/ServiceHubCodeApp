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
