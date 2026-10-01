/** Optional overrides of the data org (src/data/config.ts), set in .env.development.local for Local Play only. */
interface ImportMetaEnv {
  readonly VITE_DATA_ORG_URL?: string;
  readonly VITE_MDA_APP_ID?: string;
}
