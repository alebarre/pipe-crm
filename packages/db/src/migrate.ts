import { resolve } from 'node:path'
import { isPglite, repoRoot } from './env.ts'
import { db } from './index.ts'

const migrationsFolder = resolve(repoRoot, 'packages/db/drizzle')

/**
 * Aplica as migrations pendentes programaticamente.
 *
 * O `pnpm db:migrate` usa o drizzle-kit; esta funcao existe para os testes
 * (que sobem um banco descartavel) e para quem quiser migrar no boot da API.
 */
export async function runMigrations(): Promise<void> {
  if (isPglite) {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder })
    return
  }

  const { migrate } = await import('drizzle-orm/postgres-js/migrator')
  await migrate(db as unknown as Parameters<typeof migrate>[0], { migrationsFolder })
}
