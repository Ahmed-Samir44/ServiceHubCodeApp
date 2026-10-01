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
