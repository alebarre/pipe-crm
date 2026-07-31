// Importar antes de ler process.env: este modulo carrega o .env da raiz.
import '@pipe/db/env'
import { z } from 'zod'

const isProduction = process.env.NODE_ENV === 'production'

/**
 * Segredos: obrigatorios em producao, com default so fora dela.
 *
 * Um default silencioso em producao e o pior dos dois mundos — a API sobe
 * "funcionando" com um segredo que esta no repositorio, e ninguem percebe.
 * Aqui, subir sem JWT_SECRET em producao aborta o processo.
 */
const secret = (fallback: string) =>
  isProduction
    ? z.string().min(32, 'Em producao o segredo precisa de ao menos 32 caracteres')
    : z.string().min(1).default(fallback)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  /* ---------------------------------------------------------------------- */
  /* Autenticacao                                                           */
  /* ---------------------------------------------------------------------- */

  JWT_SECRET: secret('dev-only-jwt-secret-nao-use-em-producao'),
  COOKIE_SECRET: secret('dev-only-cookie-secret-nao-use-em-producao'),

  /** Vida do access token. Curta de proposito: o refresh cobre o resto. */
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  /** Vida do refresh token, em dias. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(7),
  /** Validade do link de redefinicao de senha, em minutos. */
  RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),

  /* ---------------------------------------------------------------------- */
  /* E-mail (SMTP do Gmail)                                                 */
  /* ---------------------------------------------------------------------- */

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  /** Senha de app do Gmail (16 caracteres), nao a senha da conta. */
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Variaveis de ambiente invalidas:\n', z.prettifyError(parsed.error))
  process.exit(1)
}

export const env = parsed.data
export const isDev = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'

/**
 * Sem credencial SMTP configurada, o mailer cai no modo "imprime no log".
 * O fluxo de recuperacao continua testavel — o link aparece no terminal da
 * API — sem depender de rede em ambiente de desenvolvimento ou de teste.
 */
export const hasSmtp = Boolean(env.SMTP_USER && env.SMTP_PASSWORD)
