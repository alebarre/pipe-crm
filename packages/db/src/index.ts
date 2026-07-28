import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { databaseUrl, isPglite, pgliteDataDir } from './env.ts'
import * as schema from './schema.ts'

let closeConnection: () => Promise<void>

async function createDb(): Promise<PostgresJsDatabase<typeof schema>> {
  if (isPglite && pgliteDataDir) {
    // Import dinamico de proposito: com postgres:// (producao) o PGlite nunca
    // e carregado, e o bundler nao precisa embutir o WASM dele no artefato.
    const [{ PGlite }, { drizzle: drizzlePglite }] = await Promise.all([
      import('@electric-sql/pglite'),
      import('drizzle-orm/pglite'),
    ])

    const client = new PGlite(pgliteDataDir)
    closeConnection = () => client.close()

    // Os dois drivers expoem a mesma API de query do Drizzle; o cast existe
    // apenas para o resto do codigo enxergar um unico tipo de Database.
    return drizzlePglite(client, { schema }) as unknown as PostgresJsDatabase<typeof schema>
  }

  const client = postgres(databaseUrl, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idle_timeout: 20,
  })
  closeConnection = () => client.end({ timeout: 5 })
  return drizzlePostgres(client, { schema })
}

export const db = await createDb()

export type Database = typeof db

/** Fecha a conexao — usado no shutdown gracioso da API e no fim do seed. */
export async function closeDb(): Promise<void> {
  await closeConnection()
}

/**
 * Os operadores do Drizzle saem daqui, e nao de `drizzle-orm` direto nos apps.
 * Motivo pratico: o pnpm resolve peers por pacote, entao importar drizzle-orm
 * em dois lugares gera duas instancias de tipo incompativeis entre si.
 * Motivo de desenho: o ORM fica encapsulado neste pacote.
 */
export {
  and,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  sql,
  sum,
} from 'drizzle-orm'
export * from './schema.ts'
export { schema }
