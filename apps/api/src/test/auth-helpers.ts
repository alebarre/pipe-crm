import { db, eq, users } from '@pipe/db'
import { hashPassword } from '@pipe/db/password'
import type { UserRole } from '@pipe/shared'
import type { FastifyInstance } from 'fastify'

/**
 * Utilitarios de sessao para a suite.
 *
 * Os testes passam pelo login de verdade em vez de forjar um JWT na mao: assim
 * o que eles exercitam e o mesmo caminho do navegador — cookie httpOnly,
 * assinatura, expiracao — e um erro no fluxo de sessao aparece aqui, e nao so
 * em produção.
 */

export type Session = {
  userId: string
  /** Pronto para o `cookies` do `app.inject`. */
  cookies: Record<string, string>
}

export const ADMIN = { email: 'admin@teste.local', password: 'admin12345' }
export const USER = { email: 'user@teste.local', password: 'user12345' }

/** Cria (ou recria) o usuario direto no banco: o papel nao passa pela API. */
export async function createUser(params: {
  name?: string
  email: string
  password: string
  role: UserRole
}): Promise<string> {
  await db.delete(users).where(eq(users.email, params.email))

  const inserted = await db
    .insert(users)
    .values({
      name: params.name ?? params.email,
      email: params.email,
      passwordHash: await hashPassword(params.password),
      role: params.role,
    })
    .returning({ id: users.id })

  const row = inserted[0]
  if (!row) throw new Error('nao consegui criar o usuario de teste')

  return row.id
}

/** Faz login e devolve os cookies emitidos pela API. */
export async function signIn(
  app: FastifyInstance,
  credentials: { email: string; password: string },
): Promise<Session> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credentials,
  })

  if (response.statusCode !== 200) {
    throw new Error(`login de teste falhou (${response.statusCode}): ${response.body}`)
  }

  return {
    userId: response.json().user.id,
    cookies: cookiesFrom(response),
  }
}

/** Cria o usuario e ja abre a sessao dele. */
export async function createUserAndSignIn(
  app: FastifyInstance,
  params: { email: string; password: string; role: UserRole },
): Promise<Session> {
  await createUser(params)
  return signIn(app, params)
}

/** Traduz o `set-cookie` da resposta para o formato que o `inject` aceita. */
export function cookiesFrom(response: {
  cookies: Array<{ name: string; value: string }>
}): Record<string, string> {
  return Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie.value]))
}
