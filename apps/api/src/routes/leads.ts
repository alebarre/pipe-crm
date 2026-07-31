import {
  and,
  asc,
  count,
  db,
  desc,
  eq,
  ilike,
  interactions,
  leads,
  type NewLeadRow,
  or,
  sql,
} from '@pipe/db'
import {
  apiErrorSchema,
  createInteractionSchema,
  createLeadSchema,
  idParamSchema,
  interactionSchema,
  isOpenStatus,
  LEAD_STATUSES,
  leadDetailSchema,
  leadSchema,
  leadStatsSchema,
  listLeadsQuerySchema,
  listLeadsResponseSchema,
  updateLeadSchema,
} from '@pipe/shared'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate, requireRole } from '../lib/auth.ts'
import { isUniqueViolation } from '../lib/errors.ts'
import { toInteraction, toLead } from '../lib/mappers.ts'

const notFound = (message: string) => ({
  statusCode: 404,
  error: 'Not Found',
  message,
})

/** O schema ja fez o trim; aqui so o vazio vira NULL em vez de string vazia. */
const clean = (value: string | null | undefined): string | null => value || null

/**
 * Quem pode o que, neste modulo:
 *
 *   admin -> criar, atualizar e excluir lead
 *   user  -> ler o pipeline e registrar interacao
 *
 * `authenticate` sozinho ja e o "qualquer um logado"; onde a operacao muda o
 * cadastro do lead, entra tambem o `requireRole('admin')`. Os hooks rodam em
 * ordem e param no primeiro que responder — sem token valido, a checagem de
 * papel nem chega a acontecer.
 *
 * `onRequest`, e nao `preHandler`: o preHandler roda DEPOIS da validacao do
 * corpo, entao um POST sem sessao e com corpo invalido receberia 400 (com o
 * detalhe de cada campo) em vez de 401. Alem de errado como resposta, e
 * trabalho gasto — e um mapa do contrato — para quem nem se identificou.
 */
const loggedIn = { onRequest: [authenticate] }
const adminOnly = { onRequest: [authenticate, requireRole('admin')] }

export async function leadRoutes(app: FastifyInstance) {
  const route = app.withTypeProvider<ZodTypeProvider>()

  /* ---------------------------------------------------------------------- */
  /* Listagem                                                               */
  /* ---------------------------------------------------------------------- */

  route.get(
    '/leads',
    {
      ...loggedIn,
      schema: {
        tags: ['leads'],
        summary: 'Lista leads com busca, filtro, ordenacao e paginacao',
        querystring: listLeadsQuerySchema,
        response: { 200: listLeadsResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request) => {
      const { q, status, page, perPage, sort, order } = request.query

      const filters = []
      if (status) filters.push(eq(leads.status, status))
      if (q) {
        const term = `%${q}%`
        filters.push(
          or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.company, term)),
        )
      }
      const where = filters.length > 0 ? and(...filters) : undefined

      const sortColumn = {
        createdAt: leads.createdAt,
        name: leads.name,
        valueCents: leads.valueCents,
      }[sort]
      const direction = order === 'asc' ? asc : desc

      // Uma query para a pagina e outra para o total, em paralelo.
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(leads)
          .where(where)
          .orderBy(direction(sortColumn))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ total: count() }).from(leads).where(where),
      ])

      const total = totals[0]?.total ?? 0

      return {
        data: rows.map(toLead),
        meta: {
          page,
          perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
        },
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Metricas — precisa vir antes de /leads/:id na leitura, embora o router  */
  /* do Fastify ja priorize rota estatica sobre parametrica.                 */
  /* ---------------------------------------------------------------------- */

  route.get(
    '/leads/stats',
    {
      ...loggedIn,
      schema: {
        tags: ['leads'],
        summary: 'Totais do pipeline agrupados por status',
        response: { 200: leadStatsSchema, 401: apiErrorSchema },
      },
    },
    async () => {
      const rows = await db
        .select({
          status: leads.status,
          count: count(),
          valueCents: sql<number>`coalesce(sum(${leads.valueCents}), 0)::int`,
        })
        .from(leads)
        .groupBy(leads.status)

      const found = new Map(rows.map((row) => [row.status, row]))

      // Status sem nenhum lead tambem aparecem, zerados.
      const byStatus = LEAD_STATUSES.map((status) => {
        const row = found.get(status)
        return {
          status,
          count: Number(row?.count ?? 0),
          valueCents: Number(row?.valueCents ?? 0),
        }
      })

      const open = byStatus.filter((entry) => isOpenStatus(entry.status))

      return {
        total: byStatus.reduce((acc, entry) => acc + entry.count, 0),
        openCount: open.reduce((acc, entry) => acc + entry.count, 0),
        openValueCents: open.reduce((acc, entry) => acc + entry.valueCents, 0),
        wonValueCents: byStatus.find((entry) => entry.status === 'won')?.valueCents ?? 0,
        byStatus,
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Detalhe                                                                */
  /* ---------------------------------------------------------------------- */

  route.get(
    '/leads/:id',
    {
      ...loggedIn,
      schema: {
        tags: ['leads'],
        summary: 'Detalhe do lead com a timeline de interacoes',
        params: idParamSchema,
        response: { 200: leadDetailSchema, 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const lead = await db.query.leads.findFirst({
        where: eq(leads.id, request.params.id),
        with: {
          interactions: {
            orderBy: (table, { desc: descending }) => [descending(table.occurredAt)],
          },
        },
      })

      if (!lead) return reply.code(404).send(notFound('Lead nao encontrado.'))

      return {
        ...toLead(lead),
        interactions: lead.interactions.map(toInteraction),
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Criacao                                                                */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/leads',
    {
      ...adminOnly,
      schema: {
        tags: ['leads'],
        summary: 'Cria um lead (admin)',
        body: createLeadSchema,
        response: {
          201: leadSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body

      try {
        const inserted = await db
          .insert(leads)
          .values({
            name: body.name,
            email: body.email,
            company: clean(body.company),
            status: body.status,
            valueCents: body.valueCents,
            notes: clean(body.notes),
          })
          .returning()

        const row = inserted[0]
        if (!row) throw new Error('INSERT nao retornou linha')

        return reply.code(201).send(toLead(row))
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ja existe um lead com esse e-mail.',
          })
        }
        throw error
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Atualizacao parcial                                                    */
  /* ---------------------------------------------------------------------- */

  route.patch(
    '/leads/:id',
    {
      ...adminOnly,
      schema: {
        tags: ['leads'],
        summary: 'Atualiza campos de um lead (admin)',
        params: idParamSchema,
        body: updateLeadSchema,
        response: {
          200: leadSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const body = request.body
      const values: Partial<NewLeadRow> = {}

      if (body.name !== undefined) values.name = body.name
      if (body.email !== undefined) values.email = body.email
      if (body.company !== undefined) values.company = clean(body.company)
      if (body.status !== undefined) values.status = body.status
      if (body.valueCents !== undefined) values.valueCents = body.valueCents
      if (body.notes !== undefined) values.notes = clean(body.notes)

      if (Object.keys(values).length === 0) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Nenhum campo para atualizar.',
        })
      }

      try {
        const updated = await db
          .update(leads)
          .set(values)
          .where(eq(leads.id, request.params.id))
          .returning()

        const row = updated[0]
        if (!row) return reply.code(404).send(notFound('Lead nao encontrado.'))

        return toLead(row)
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ja existe um lead com esse e-mail.',
          })
        }
        throw error
      }
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Remocao                                                                */
  /* ---------------------------------------------------------------------- */

  route.delete(
    '/leads/:id',
    {
      ...adminOnly,
      schema: {
        tags: ['leads'],
        summary: 'Remove um lead, com as interacoes em cascata (admin). 404 se nao existir.',
        params: idParamSchema,
        response: {
          // 204 nao tem corpo — o `z.null()` existe so para o `.code(204)`
          // continuar valido agora que a rota declara respostas de erro.
          204: z.null(),
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const deleted = await db
        .delete(leads)
        .where(eq(leads.id, request.params.id))
        .returning({ id: leads.id })

      if (deleted.length === 0) return reply.code(404).send(notFound('Lead nao encontrado.'))

      return reply.code(204).send(null)
    },
  )

  /* ---------------------------------------------------------------------- */
  /* Interacoes                                                             */
  /* ---------------------------------------------------------------------- */

  route.post(
    '/leads/:id/interactions',
    {
      // Registrar atividade nao mexe no cadastro do lead: vale para os dois
      // papeis. E o que faz do "user" um perfil util, e nao so leitura.
      ...loggedIn,
      schema: {
        tags: ['interactions'],
        summary: 'Registra uma interacao na timeline do lead',
        params: idParamSchema,
        body: createInteractionSchema,
        response: { 201: interactionSchema, 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const exists = await db
        .select({ id: leads.id })
        .from(leads)
        .where(eq(leads.id, request.params.id))
        .limit(1)

      if (exists.length === 0) return reply.code(404).send(notFound('Lead nao encontrado.'))

      const inserted = await db
        .insert(interactions)
        .values({
          leadId: request.params.id,
          type: request.body.type,
          content: request.body.content,
          occurredAt: request.body.occurredAt ? new Date(request.body.occurredAt) : new Date(),
        })
        .returning()

      const row = inserted[0]
      if (!row) throw new Error('INSERT nao retornou linha')

      return reply.code(201).send(toInteraction(row))
    },
  )
}
