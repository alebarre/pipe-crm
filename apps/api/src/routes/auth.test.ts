import { closeDb, db, eq, refreshTokens, users } from '@pipe/db'
import { runMigrations } from '@pipe/db/migrate'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app.ts'
import { ADMIN, cookiesFrom, createUser, signIn, USER } from '../test/auth-helpers.ts'

/**
 * O link de recuperacao so existe dentro do e-mail. Em vez de ler o log, a
 * suite troca o mailer por um coletor — assim os testes conferem o conteudo
 * do que seria enviado sem depender de rede.
 */
const { enviados } = vi.hoisted(() => ({
  enviados: [] as Array<{ to: string; name: string; link: string; expiresInMinutes: number }>,
}))

vi.mock('../lib/mailer.ts', () => ({
  sendPasswordResetEmail: async (params: (typeof enviados)[number]) => {
    enviados.push(params)
  },
}))

let app: FastifyInstance

beforeAll(async () => {
  await runMigrations()
  app = await buildApp()
  await app.ready()
})

beforeEach(async () => {
  // Os tokens caem em cascata junto com os usuarios.
  await db.delete(users)
  enviados.length = 0
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const post = (url: string, payload?: InjectOptions['payload'], cookies?: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/auth/${url}`, payload, cookies })

const tokenDoLink = (link: string) => new URL(link).searchParams.get('token') ?? ''

/* -------------------------------------------------------------------------- */
/* Cadastro                                                                   */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/register', () => {
  it('cria a conta, ja abre a sessao e nunca devolve o hash da senha', async () => {
    const response = await post('register', {
      name: 'Ana Souza',
      email: 'ANA@acme.com ',
      password: 'senha-bem-boa',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().user).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@acme.com',
      role: 'user',
    })
    expect(response.body).not.toMatch(/argon2|passwordHash/i)

    const cookies = cookiesFrom(response)
    expect(cookies.pipe_at).toBeTruthy()
    expect(cookies.pipe_rt).toBeTruthy()
  })

  it('marca os cookies como httpOnly e sameSite=lax', async () => {
    const response = await post('register', {
      name: 'Ana Souza',
      email: 'ana@acme.com',
      password: 'senha-bem-boa',
    })

    // O front nao le esses cookies: e o que impede um XSS de roubar a sessao.
    for (const cookie of response.cookies) {
      expect(cookie.httpOnly).toBe(true)
      expect(cookie.sameSite?.toLowerCase()).toBe('lax')
    }
  })

  it('ignora o papel enviado no corpo — cadastro publico nunca cria admin', async () => {
    const response = await post('register', {
      name: 'Esperto',
      email: 'esperto@acme.com',
      password: 'senha-bem-boa',
      role: 'admin',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().user.role).toBe('user')

    const gravado = await db.query.users.findFirst({ where: eq(users.email, 'esperto@acme.com') })
    expect(gravado?.role).toBe('user')
  })

  it('devolve 409 para e-mail ja cadastrado', async () => {
    const conta = { name: 'Ana Souza', email: 'ana@acme.com', password: 'senha-bem-boa' }
    await post('register', conta)

    const response = await post('register', conta)

    expect(response.statusCode).toBe(409)
  })

  it('recusa senha curta apontando o campo', async () => {
    const response = await post('register', {
      name: 'Ana Souza',
      email: 'ana@acme.com',
      password: '123',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().details[0].path).toBe('password')
  })
})

/* -------------------------------------------------------------------------- */
/* Login                                                                      */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createUser({ ...ADMIN, role: 'admin' })
  })

  it('autentica e devolve o papel do usuario', async () => {
    const response = await post('login', ADMIN)

    expect(response.statusCode).toBe(200)
    expect(response.json().user.role).toBe('admin')
  })

  it('da a mesma resposta para senha errada e para e-mail inexistente', async () => {
    const senhaErrada = await post('login', { email: ADMIN.email, password: 'errada' })
    const inexistente = await post('login', { email: 'ninguem@acme.com', password: 'errada' })

    expect(senhaErrada.statusCode).toBe(401)
    expect(inexistente.statusCode).toBe(401)
    // Mensagens iguais: a tela de login nao vira um verificador de cadastro.
    expect(senhaErrada.json().message).toBe(inexistente.json().message)
  })
})

/* -------------------------------------------------------------------------- */
/* Sessao atual                                                               */
/* -------------------------------------------------------------------------- */

describe('GET /api/auth/me', () => {
  it('devolve o usuario logado', async () => {
    await createUser({ ...USER, role: 'user' })
    const session = await signIn(app, USER)

    const response = await app.inject({ url: '/api/auth/me', cookies: session.cookies })

    expect(response.statusCode).toBe(200)
    expect(response.json().user.email).toBe(USER.email)
  })

  it('responde 401 sem cookie', async () => {
    const response = await app.inject({ url: '/api/auth/me' })

    expect(response.statusCode).toBe(401)
  })
})

/* -------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/refresh', () => {
  it('rotaciona o refresh token e emite um access token novo', async () => {
    await createUser({ ...USER, role: 'user' })
    const session = await signIn(app, USER)

    const response = await post('refresh', undefined, session.cookies)
    const novos = cookiesFrom(response)

    expect(response.statusCode).toBe(200)
    expect(response.json().user.email).toBe(USER.email)
    expect(novos.pipe_rt).toBeTruthy()
    expect(novos.pipe_rt).not.toBe(session.cookies.pipe_rt)

    // O novo par funciona.
    const seguinte = await post('refresh', undefined, novos)
    expect(seguinte.statusCode).toBe(200)
  })

  it('derruba a familia inteira quando um token ja usado reaparece', async () => {
    await createUser({ ...USER, role: 'user' })
    const session = await signIn(app, USER)

    const primeiro = await post('refresh', undefined, session.cookies)
    const novos = cookiesFrom(primeiro)

    // Reapresentar o token antigo e o sintoma classico de cookie roubado.
    const reuso = await post('refresh', undefined, session.cookies)
    expect(reuso.statusCode).toBe(401)

    // Nao basta recusar aquela tentativa: o token que o ladrao teria em maos
    // (o mais novo) tambem precisa parar de valer.
    const depois = await post('refresh', undefined, novos)
    expect(depois.statusCode).toBe(401)
  })

  it('responde 401 sem cookie de refresh', async () => {
    const response = await post('refresh')

    expect(response.statusCode).toBe(401)
  })
})

/* -------------------------------------------------------------------------- */
/* Logout                                                                     */
/* -------------------------------------------------------------------------- */

describe('POST /api/auth/logout', () => {
  it('revoga a sessao e limpa os cookies', async () => {
    await createUser({ ...USER, role: 'user' })
    const session = await signIn(app, USER)

    const response = await post('logout', undefined, session.cookies)

    expect(response.statusCode).toBe(204)
    for (const cookie of response.cookies) expect(cookie.value).toBe('')

    const depois = await post('refresh', undefined, session.cookies)
    expect(depois.statusCode).toBe(401)
  })

  it('e idempotente: sem sessao tambem responde 204', async () => {
    expect((await post('logout')).statusCode).toBe(204)
  })
})

/* -------------------------------------------------------------------------- */
/* Recuperacao de senha                                                       */
/* -------------------------------------------------------------------------- */

describe('recuperacao de senha', () => {
  beforeEach(async () => {
    await createUser({ name: 'Ana Souza', ...USER, role: 'user' })
  })

  it('envia o link e responde 202', async () => {
    const response = await post('forgot-password', { email: USER.email })

    expect(response.statusCode).toBe(202)
    expect(enviados).toHaveLength(1)
    expect(enviados[0]?.to).toBe(USER.email)
    expect(tokenDoLink(enviados[0]?.link ?? '')).toBeTruthy()
  })

  it('responde igual para e-mail que nao existe, e nao envia nada', async () => {
    const conhecido = await post('forgot-password', { email: USER.email })
    const desconhecido = await post('forgot-password', { email: 'ninguem@acme.com' })

    expect(desconhecido.statusCode).toBe(conhecido.statusCode)
    expect(desconhecido.json().message).toBe(conhecido.json().message)
    expect(enviados).toHaveLength(1)
  })

  it('troca a senha, invalida o token e derruba as sessoes antigas', async () => {
    const sessaoAntiga = await signIn(app, USER)

    await post('forgot-password', { email: USER.email })
    const token = tokenDoLink(enviados[0]?.link ?? '')

    const reset = await post('reset-password', { token, password: 'nova-senha-boa' })
    expect(reset.statusCode).toBe(200)

    // A senha nova entra...
    const novoLogin = await post('login', { email: USER.email, password: 'nova-senha-boa' })
    expect(novoLogin.statusCode).toBe(200)

    // ...a antiga nao...
    const loginAntigo = await post('login', USER)
    expect(loginAntigo.statusCode).toBe(401)

    // ...e quem estava logado com a senha velha perde a sessao.
    const refreshAntigo = await post('refresh', undefined, sessaoAntiga.cookies)
    expect(refreshAntigo.statusCode).toBe(401)
  })

  it('o token e de uso unico', async () => {
    await post('forgot-password', { email: USER.email })
    const token = tokenDoLink(enviados[0]?.link ?? '')

    await post('reset-password', { token, password: 'nova-senha-boa' })
    const segunda = await post('reset-password', { token, password: 'outra-senha-boa' })

    expect(segunda.statusCode).toBe(400)
  })

  it('um pedido novo invalida o link anterior', async () => {
    await post('forgot-password', { email: USER.email })
    await post('forgot-password', { email: USER.email })

    const antigo = tokenDoLink(enviados[0]?.link ?? '')
    const recente = tokenDoLink(enviados[1]?.link ?? '')

    expect(
      (await post('reset-password', { token: antigo, password: 'nova-senha-boa' })).statusCode,
    ).toBe(400)
    expect(
      (await post('reset-password', { token: recente, password: 'nova-senha-boa' })).statusCode,
    ).toBe(200)
  })

  it('recusa token inventado', async () => {
    const response = await post('reset-password', {
      token: 'token-que-nunca-existiu',
      password: 'nova-senha-boa',
    })

    expect(response.statusCode).toBe(400)
  })
})

/* -------------------------------------------------------------------------- */
/* Persistencia dos tokens                                                    */
/* -------------------------------------------------------------------------- */

describe('armazenamento do refresh token', () => {
  it('guarda o hash, e nao o token que o navegador tem', async () => {
    const userId = await createUser({ ...USER, role: 'user' })
    const session = await signIn(app, USER)

    const linhas = await db.query.refreshTokens.findMany({
      where: eq(refreshTokens.userId, userId),
    })

    expect(linhas).toHaveLength(1)
    // Vazar o banco nao entrega sessao nenhuma.
    expect(linhas[0]?.tokenHash).not.toBe(session.cookies.pipe_rt)
    expect(linhas[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
  })
})
