import { closeDb, db, leads } from '@pipe/db'
import { runMigrations } from '@pipe/db/migrate'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

let app: FastifyInstance

beforeAll(async () => {
  await runMigrations()
  app = await buildApp()
  await app.ready()
})

beforeEach(async () => {
  await db.delete(leads)
})

afterAll(async () => {
  await app.close()
  await closeDb()
})

const criar = (body: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/leads', payload: body })

describe('POST /api/leads', () => {
  it('cria um lead com os defaults do schema', async () => {
    const response = await criar({ name: 'Ana Souza', email: 'ana@acme.com' })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@acme.com',
      status: 'new',
      valueCents: 0,
      company: null,
    })
  })

  it('normaliza espacos e caixa antes de gravar', async () => {
    const response = await criar({
      name: '  Bruno Lima  ',
      email: '  BRUNO@ACME.COM ',
      company: '  Acme  ',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'Bruno Lima',
      email: 'bruno@acme.com',
      company: 'Acme',
    })
  })

  it('recusa entrada invalida apontando cada campo', async () => {
    const response = await criar({ name: 'a', email: 'nao-e-email', valueCents: -1 })

    expect(response.statusCode).toBe(400)
    const paths = response.json().details.map((detail: { path: string }) => detail.path)
    expect(paths).toEqual(['name', 'email', 'valueCents'])
  })

  it('devolve 409 quando o e-mail ja existe', async () => {
    await criar({ name: 'Ana Souza', email: 'ana@acme.com' })
    const response = await criar({ name: 'Outra Ana', email: 'ana@acme.com' })

    expect(response.statusCode).toBe(409)
    expect(response.json().message).toMatch(/ja existe/i)
  })

  it('nao deixa campo fora do schema vazar para o banco', async () => {
    const response = await criar({
      name: 'Ana Souza',
      email: 'ana@acme.com',
      isAdmin: true,
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).not.toHaveProperty('isAdmin')
  })
})

describe('GET /api/leads', () => {
  beforeEach(async () => {
    await criar({ name: 'Ana Souza', email: 'ana@acme.com', status: 'won', valueCents: 5000 })
    await criar({
      name: 'Bruno Lima',
      email: 'bruno@northwind.com',
      status: 'new',
      valueCents: 900,
    })
    await criar({ name: 'Carla Reis', email: 'carla@acme.com', status: 'won', valueCents: 30000 })
  })

  it('filtra por status', async () => {
    const response = await app.inject({ url: '/api/leads?status=won' })

    expect(response.statusCode).toBe(200)
    expect(response.json().meta.total).toBe(2)
  })

  it('busca por nome, e-mail ou empresa', async () => {
    const response = await app.inject({ url: '/api/leads?q=northwind' })

    expect(response.json().data).toHaveLength(1)
    expect(response.json().data[0].name).toBe('Bruno Lima')
  })

  it('ordena e pagina', async () => {
    const response = await app.inject({ url: '/api/leads?sort=valueCents&order=desc&perPage=2' })

    const body = response.json()
    expect(body.data.map((lead: { valueCents: number }) => lead.valueCents)).toEqual([30000, 5000])
    expect(body.meta).toMatchObject({ page: 1, perPage: 2, total: 3, totalPages: 2 })
  })

  it('rejeita filtro fora do enum', async () => {
    const response = await app.inject({ url: '/api/leads?status=inexistente' })

    expect(response.statusCode).toBe(400)
  })
})

describe('ciclo de vida do lead', () => {
  it('cria, adiciona interacao, atualiza e remove em cascata', async () => {
    const criado = await criar({ name: 'Ana Souza', email: 'ana@acme.com' })
    const { id } = criado.json()

    const interacao = await app.inject({
      method: 'POST',
      url: `/api/leads/${id}/interactions`,
      payload: { type: 'call', content: 'Primeira conversa' },
    })
    expect(interacao.statusCode).toBe(201)

    const detalhe = await app.inject({ url: `/api/leads/${id}` })
    expect(detalhe.json().interactions).toHaveLength(1)

    const atualizado = await app.inject({
      method: 'PATCH',
      url: `/api/leads/${id}`,
      payload: { status: 'won', valueCents: 123456 },
    })
    expect(atualizado.json()).toMatchObject({ status: 'won', valueCents: 123456 })

    const removido = await app.inject({ method: 'DELETE', url: `/api/leads/${id}` })
    expect(removido.statusCode).toBe(204)

    const depois = await app.inject({ url: `/api/leads/${id}` })
    expect(depois.statusCode).toBe(404)
  })

  it('PATCH parcial nao zera os campos que nao foram enviados', async () => {
    const criado = await criar({
      name: 'Ana Souza',
      email: 'ana@acme.com',
      company: 'Acme',
      valueCents: 50_000,
    })
    const { id } = criado.json()

    const atualizado = await app.inject({
      method: 'PATCH',
      url: `/api/leads/${id}`,
      payload: { status: 'won' },
    })

    expect(atualizado.json()).toMatchObject({
      status: 'won',
      valueCents: 50_000,
      company: 'Acme',
    })
  })

  it('devolve 400 para id que nao e uuid', async () => {
    const response = await app.inject({ url: '/api/leads/nao-e-uuid' })

    expect(response.statusCode).toBe(400)
  })
})

describe('GET /api/leads/stats', () => {
  it('agrega por status incluindo os zerados', async () => {
    await criar({ name: 'Ana Souza', email: 'ana@acme.com', status: 'won', valueCents: 10000 })
    await criar({ name: 'Bruno Lima', email: 'bruno@acme.com', status: 'new', valueCents: 2000 })

    const stats = (await app.inject({ url: '/api/leads/stats' })).json()

    expect(stats.total).toBe(2)
    expect(stats.wonValueCents).toBe(10000)
    expect(stats.openValueCents).toBe(2000)
    expect(stats.byStatus).toHaveLength(6)
    expect(stats.byStatus.find((s: { status: string }) => s.status === 'lost')).toMatchObject({
      count: 0,
      valueCents: 0,
    })
  })
})
