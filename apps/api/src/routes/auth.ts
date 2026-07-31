import { randomBytes } from 'node:crypto'
import { and, db, eq, isNull, passwordResetTokens, users } from '@pipe/db'
import { hashPassword, verifyPassword } from '@pipe/db/password'
import type { UserRole } from '@pipe/shared'
import {
  apiErrorSchema,
  forgotPasswordSchema,
  loginSchema,
  messageSchema,
  registerSchema,
  resetPasswordSchema,
  sessionSchema,
} from '@pipe/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { env, isTest } from '../env.ts'
import {
  authenticate,
  clearAuthCookies,
  hashToken,
  issueRefreshToken,
  REFRESH_COOKIE,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from '../lib/auth.ts'
import { isUniqueViolation } from '../lib/errors.ts'
import { sendPasswordResetEmail } from '../lib/mailer.ts'
import { toUser } from '../lib/mappers.ts'

/**
 * Mesma resposta para "e-mail nao existe" e "senha errada".
 *
 * Distinguir os dois casos transforma a tela de login num verificador de
 * cadastro: da para descobrir quem tem conta no sistema so pela mensagem.
 */
const invalidCredentials = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'E-mail ou senha invalidos.',
}

const invalidSession = (message: string) => ({
  statusCode: 401,
  error: 'Unauthorized',
  message,
})

/**
 * Hash descartavel usado quando o e-mail nao existe.
 *
 * Sem isto, a resposta para um e-mail desconhecido volta na hora e a de uma
 * senha errada demora o tempo do Argon2 — a diferenca de tempo entrega quais
 * e-mails estao cadastrados. Aqui os dois caminhos custam o mesmo.
 */
let decoyHash: Promise<string> | null = null
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(randomBytes(24).toString('hex'))
  return decoyHash
}

/**
 * Limite de tentativas nas rotas que dao para atacar por forca bruta.
 *
 * Na suite o teto sobe: dezenas de logins em poucos segundos sao normais ali e
 * fariam a rota comecar a responder 429 no meio dos casos.
 */
const throttle = (max: number, timeWindow: string) => ({
  rateLimit: { max: isTest ? 10_000 : max, timeWindow },
})

export async function authRoutes(app: FastifyInstance) {
  const route = app.withTypeProvider<ZodTypeProvider>()

  /** Emite o par de tokens de um login novo e grava os dois cookies. */
  async function startSession(
    request: FastifyRequest,
    reply: FastifyReply,
    user: { id: string; role: UserRole },
  ): Promise<void> {
    const accessToken = signAccessToken(request, { sub: user.id, role: user.role })
    const refreshToken = await issueRefreshToken(user.id)
    setAuthCookies(reply, { accessToken, refreshToken })
  }

  /* ---------------------------------------------------------------------- */
  /* Cadastro                                                               */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/register',
    {
      config: throttle(10, '1 hour'),
      schema: {
        tags: ['auth'],
        summary: 'Cria uma conta e ja abre a sessao',
        body: registerSchema,
        response: { 201: sessionSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body

      try {
        const inserted = await db
          .insert(users)
          .values({
            name,
            email,
            passwordHash: await hashPassword(password),
            // O papel nao vem do corpo da requisicao. Cadastro publico cria
            // sempre um usuario comum; admin nasce pelo seed.
            role: 'user',
          })
          .returning()

        const row = inserted[0]
        if (!row) throw new Error('INSERT nao retornou linha')

        await startSession(request, reply, row)

        return reply.code(201).send({ user: toUser(row) })
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ja existe uma conta com esse e-mail.',
          })
        }
        throw error
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Login                                                                  */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/login',
    {
      config: throttle(10, '15 minutes'),
      schema: {
        tags: ['auth'],
        summary: 'Autentica e abre a sessao',
        body: loginSchema,
        response: { 200: sessionSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body

      const user = await db.query.users.findFirst({ where: eq(users.email, email) })

      const matches = await verifyPassword(user?.passwordHash ?? (await getDecoyHash()), password)

      if (!user || !matches) {
        return reply.code(401).send(invalidCredentials)
      }

      await startSession(request, reply, user)

      return reply.send({ user: toUser(user) })
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Renovacao                                                              */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotaciona o refresh token e emite um novo access token',
        response: { 200: sessionSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const rawToken = request.cookies[REFRESH_COOKIE]

      if (!rawToken) {
        return reply.code(401).send(invalidSession('Nao ha sessao para renovar.'))
      }

      const rotated = await rotateRefreshToken(rawToken)

      if (!rotated.ok) {
        // Em qualquer falha o cookie sai do navegador: mantê-lo so faria o
        // front tentar renovar de novo, em laco, com um token que nao serve.
        clearAuthCookies(reply)

        if (rotated.reason === 'reused') {
          request.log.warn('refresh token reapresentado — familia revogada')
        }

        return reply.code(401).send(invalidSession('Sua sessao expirou. Faca login novamente.'))
      }

      const user = await db.query.users.findFirst({ where: eq(users.id, rotated.userId) })

      if (!user) {
        clearAuthCookies(reply)
        return reply.code(401).send(invalidSession('Usuario nao encontrado.'))
      }

      const accessToken = signAccessToken(request, { sub: user.id, role: user.role })
      setAuthCookies(reply, { accessToken, refreshToken: rotated.refreshToken })

      return reply.send({ user: toUser(user) })
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Logout                                                                 */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Encerra a sessao deste navegador',
        // Sempre 204, com ou sem sessao: logout e idempotente.
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const rawToken = request.cookies[REFRESH_COOKIE]
      if (rawToken) await revokeRefreshToken(rawToken)

      clearAuthCookies(reply)

      return reply.code(204).send(null)
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Sessao atual                                                           */
  /* ---------------------------------------------------------------------- */

  route.get(
    '/auth/me',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Dados do usuario autenticado',
        response: { 200: sessionSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const user = await db.query.users.findFirst({ where: eq(users.id, request.user.sub) })

      // Token valido de um usuario que nao existe mais (conta apagada).
      if (!user) {
        clearAuthCookies(reply)
        return reply.code(401).send(invalidSession('Usuario nao encontrado.'))
      }

      return reply.send({ user: toUser(user) })
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Esqueci a senha                                                        */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/forgot-password',
    {
      config: throttle(5, '1 hour'),
      schema: {
        tags: ['auth'],
        summary: 'Envia o link de redefinicao de senha',
        body: forgotPasswordSchema,
        response: { 202: messageSchema },
      },
    },
    async (request, reply) => {
      const { email } = request.body

      const user = await db.query.users.findFirst({ where: eq(users.email, email) })

      if (user) {
        // Pedido novo invalida os anteriores: o link mais recente e o unico
        // que funciona, e um e-mail antigo esquecido na caixa de entrada
        // deixa de ser uma porta aberta.
        await db
          .update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)))

        const token = randomBytes(32).toString('base64url')

        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000),
        })

        const link = `${env.WEB_ORIGIN}/reset-password?token=${token}`

        try {
          await sendPasswordResetEmail(
            {
              to: user.email,
              name: user.name,
              link,
              expiresInMinutes: env.RESET_TOKEN_TTL_MINUTES,
            },
            request.log,
          )
        } catch (error) {
          // SMTP fora do ar nao pode virar 500 nesta tela: isso contaria ao
          // visitante que o e-mail existe. Fica o registro para investigar.
          request.log.error({ err: error }, 'falha ao enviar e-mail de recuperacao')
        }
      }

      // Sempre a mesma resposta, exista a conta ou nao.
      return reply.code(202).send({
        message: 'Se houver uma conta com esse e-mail, o link de redefinicao foi enviado.',
      })
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Redefinir senha                                                        */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/auth/reset-password',
    {
      config: throttle(10, '1 hour'),
      schema: {
        tags: ['auth'],
        summary: 'Troca a senha usando o token recebido por e-mail',
        body: resetPasswordSchema,
        response: { 200: messageSchema, 400: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body

      const found = await db.query.passwordResetTokens.findFirst({
        where: eq(passwordResetTokens.tokenHash, hashToken(token)),
      })

      const expired = found ? found.expiresAt.getTime() <= Date.now() : false

      if (!found || found.usedAt || expired) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Link invalido ou expirado. Peca um novo.',
        })
      }

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(password) })
        .where(eq(users.id, found.userId))

      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, found.id))

      // Quem trocou a senha espera que as sessoes antigas caiam — inclusive a
      // de quem eventualmente tenha entrado na conta.
      await revokeAllUserTokens(found.userId)
      clearAuthCookies(reply)

      return reply.send({ message: 'Senha alterada. Entre com a nova senha.' })
    },
  )
}
