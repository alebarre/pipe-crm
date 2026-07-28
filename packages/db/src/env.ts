import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config } from 'dotenv'

/**
 * A raiz do monorepo e achada subindo a partir do cwd ate encontrar o
 * pnpm-workspace.yaml. Isso funciona tanto sob ESM (tsx, vite) quanto sob o
 * bundle CJS que o drizzle-kit faz do drizzle.config.ts — onde
 * `import.meta.dirname` nao existe.
 */
function findRepoRoot(start: string): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

export const repoRoot = findRepoRoot(process.cwd())

config({ path: resolve(repoRoot, '.env'), quiet: true })

const url = process.env.DATABASE_URL

if (!url) {
  throw new Error(
    `DATABASE_URL nao definida. Copie .env.example para .env na raiz do projeto (${repoRoot}).`,
  )
}

export const databaseUrl: string = url

/**
 * Dois modos, mesmo Postgres:
 *  - postgres://...  -> servidor de verdade (docker compose), driver postgres-js
 *  - pglite://<dir>  -> Postgres embarcado em WASM, sem infra nenhuma
 *
 * Mesmo dialeto e mesmas migrations nos dois. O PGlite existe so para levantar
 * o projeto sem Docker; producao usa sempre a primeira forma.
 */
export const isPglite = databaseUrl.startsWith('pglite://')

/** Diretorio de dados do PGlite, resolvido a partir da raiz do repo. */
export const pgliteDataDir = isPglite
  ? resolve(repoRoot, databaseUrl.slice('pglite://'.length) || '.pgdata')
  : null
