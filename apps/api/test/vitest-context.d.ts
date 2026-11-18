// The database global setup (packages/db/test/global-setup.ts) provides this value.
export {};

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
