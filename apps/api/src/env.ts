// Importar antes de ler process.env: este modulo carrega o .env da raiz.
import '@pipe/db/env'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variaveis de ambiente invalidas:\n', z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const isDev = env.NODE_ENV === 'development'
