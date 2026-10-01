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
