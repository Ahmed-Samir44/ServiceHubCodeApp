/**
 * Dataverse organization that holds the ServiceHub tables. The code app itself is hosted in a
 * different environment (see power.config.json), so every read goes through the generic
 * Dataverse connector's `*WithOrganization` operations with this URL.
 *
 * Single place to change when moving from the dev data org to production.
 */
export const DATA_ORG_URL = 'https://org319b4ea9.crm4.dynamics.com';

/**
 * The model-driven app whose table experience ServiceHub mirrors (its `appid`). Table pages show
 * the views that app includes, like the model-driven app does. Changes with the data org.
 */
export const MDA_APP_ID = '0ac620f5-a688-f011-b4cc-6045bdf37b46';
