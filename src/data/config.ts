/**
 * Dataverse organization that holds the ServiceHub tables. The code app itself is hosted in a
 * different environment (see power.config.json), so every read goes through the generic
 * Dataverse connector's `*WithOrganization` operations with this URL.
 *
 * Single place to change when moving from the dev data org to production.
 */
export const DATA_ORG_URL = 'https://org319b4ea9.crm4.dynamics.com';
