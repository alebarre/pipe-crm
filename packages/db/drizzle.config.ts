import { defineConfig } from 'drizzle-kit'
import { databaseUrl, isPglite, pgliteDataDir } from './src/env.ts'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(isPglite && pgliteDataDir
    ? { driver: 'pglite' as const, dbCredentials: { url: pgliteDataDir } }
    : { dbCredentials: { url: databaseUrl } }),
})
