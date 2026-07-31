import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, db, eq, isNull, refreshTokens } from '@pipe/db'
import type { UserRole } from '@pipe/shared'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env, isDev } from '../env.ts'

/* -------------------------------------------------------------------------- */
/* Payload do access token                                                    */
/* -------------------------------------------------------------------------- */

export type AccessTokenPayload = {
  sub: string
  role: UserRole
}

/**
 * O tipo que `request.user` assume depois de `jwtVerify()`. Sem esta
 * declaracao ele seria `unknown` e cada rota precisaria de cast.
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload
    user: AccessTokenPayload
  }
}

/* -------------------------------------------------------------------------- */
/* Cookies                                                                    */
/* -------------------------------------------------------------------------- */

export const ACCESS_COOKIE = 'pipe_at'
export const REFRESH_COOKIE = 'pipe_rt'

/**
 * Front e API vivem na mesma origem (o Vite faz proxy de /api em dev, e em
 * producao o front e servido atras do mesmo dominio). Isso permite guardar os
 * tokens em cookie httpOnly: o JavaScript da pagina nao os le, entao um XSS
 * nao consegue exfiltrar a sessao — o que aconteceria com localStorage.
 *
 * SameSite=Lax basta como defesa de CSRF aqui: o navegador nao anexa o cookie
 * em POST/PATCH/DELETE partindo de outro site. Nao ha fluxo cross-site neste
 * produto que precise de SameSite=None.
 */
const baseCookie = {
  httpOnly: true,
  sameSite: 'lax',
  secure: !isDev,
} as const

const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

/**
 * O refresh token so e enviado para as rotas de sessao. Nas outras chamadas
 * ele nem sai do navegador, o que reduz a superficie de vazamento em log de
 * proxy, header repetido e afins.
 */
const REFRESH_COOKIE_PATH = '/api/auth'

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
): void {
  reply.setCookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    path: '/',
    // Sem maxAge: vira cookie de sessao do navegador. Quem manda na validade e
    // a expiracao assinada dentro do proprio JWT, que o cliente nao adultera.
  })

  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_MS / 1000,
  })
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: '/' })
  reply.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: REFRESH_COOKIE_PATH })
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Token opaco: 32 bytes de aleatoriedade criptografica. Nao carrega dado
 * nenhum — quem manda e a linha correspondente no banco, o que torna a
 * revogacao imediata (um JWT revogado continuaria valido ate expirar).
 */
function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 e o suficiente para valor aleatorio: nao ha senha a adivinhar. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function signAccessToken(request: FastifyRequest, payload: AccessTokenPayload): string {
  return request.server.jwt.sign(payload, { expiresIn: env.ACCESS_TOKEN_TTL })
}

/**
 * Cria um refresh token novo. `familyId` ausente inicia uma familia — cada
 * login abre a sua, de forma que derrubar uma sessao comprometida nao desloga
 * o usuario dos outros aparelhos.
 */
export async function issueRefreshToken(userId: string, familyId?: string): Promise<string> {
  const token = newOpaqueToken()

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    familyId: familyId ?? randomUUID(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })

  return token
}

export type RotationResult =
  | { ok: true; userId: string; refreshToken: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'reused' }

/**
 * Troca um refresh token por outro (rotacao).
 *
 * Reapresentar um token ja rotacionado nao e erro de cliente bem-comportado:
 * ou alguem copiou o cookie, ou o token vazou. Nos dois casos a resposta certa
 * e derrubar a familia inteira e obrigar login de novo — recusar so aquela
 * requisicao deixaria o atacante seguir usando o token que ele roubou.
 */
export async function rotateRefreshToken(rawToken: string): Promise<RotationResult> {
  const tokenHash = hashToken(rawToken)

  const found = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
  })

  if (!found) return { ok: false, reason: 'invalid' }

  if (found.revokedAt) {
    await revokeFamily(found.familyId)
    return { ok: false, reason: 'reused' }
  }

  if (found.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, found.id))

  const refreshToken = await issueRefreshToken(found.userId, found.familyId)

  return { ok: true, userId: found.userId, refreshToken }
}

/** Logout: mata so a sessao daquele navegador. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(rawToken)), isNull(refreshTokens.revokedAt)))
}

export async function revokeFamily(familyId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
}

/** Usado depois de trocar a senha: toda sessao antiga deixa de valer. */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}

/* -------------------------------------------------------------------------- */
/* Hooks de rota                                                              */
/* -------------------------------------------------------------------------- */

const unauthorized = {
  statusCode: 401,
  error: 'Unauthorized',
  message: 'Sessao expirada ou ausente. Faca login novamente.',
}

/**
 * Exige um access token valido. O papel sai do proprio token, sem ida ao
 * banco — e por isso que o access token dura pouco: uma mudanca de papel so
 * vale de fato no proximo refresh (ate 15 minutos).
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    return reply.code(401).send(unauthorized)
  }
}

/**
 * Restringe a rota a determinados papeis. Vem sempre depois de `authenticate`
 * na lista de preHandler — o Fastify os executa em ordem e para no primeiro
 * que responder.
 *
 * 403 e nao 404: o recurso existe, o usuario e que nao pode fazer aquilo.
 */
export function requireRole(...roles: UserRole[]) {
  return async function checkRole(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!roles.includes(request.user.role)) {
      return reply.code(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Seu perfil nao permite esta operacao.',
      })
    }
  }
}
