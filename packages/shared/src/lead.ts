import { z } from 'zod'

/**
 * Fonte unica de verdade do dominio "lead".
 *
 * Estes schemas sao consumidos por:
 *  - apps/api    -> validacao de request + serializacao de response (Fastify)
 *  - apps/web    -> validacao de formulario (React Hook Form) e tipos do client
 *  - packages/db -> confere com o enum do Postgres via LEAD_STATUSES
 */

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const

export const leadStatusSchema = z.enum(LEAD_STATUSES)
export type LeadStatus = z.infer<typeof leadStatusSchema>

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
  proposal: 'Proposta',
  won: 'Ganho',
  lost: 'Perdido',
}

/** Status que ainda contam como pipeline aberto. */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal'] as const

export function isOpenStatus(status: LeadStatus): boolean {
  return (OPEN_LEAD_STATUSES as readonly LeadStatus[]).includes(status)
}

/* -------------------------------------------------------------------------- */
/* Entidade (o que a API devolve)                                             */
/* -------------------------------------------------------------------------- */

export const leadSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  company: z.string().nullable(),
  status: leadStatusSchema,
  valueCents: z.int().nonnegative(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type Lead = z.infer<typeof leadSchema>

/* -------------------------------------------------------------------------- */
/* Entrada (o que a API aceita e o que o formulario valida)                   */
/* -------------------------------------------------------------------------- */

/**
 * Campos sem `.default()`. Os defaults entram so na criacao — veja abaixo por
 * que isso importa.
 *
 * O trim faz parte do contrato, nao do handler: quem cola um valor com espaco
 * sobrando no formulario tem o dado limpo, nao um erro na cara.
 */
const leadFields = {
  name: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres')
    .max(120, 'Maximo de 120 caracteres'),
  email: z.string().trim().toLowerCase().pipe(z.email('E-mail invalido')),
  company: z.string().trim().max(120, 'Maximo de 120 caracteres').nullish(),
  status: leadStatusSchema,
  valueCents: z
    .int('Informe um valor inteiro em centavos')
    .min(0, 'O valor nao pode ser negativo')
    .max(100_000_000_00, 'Valor acima do limite'),
  notes: z.string().trim().max(2000, 'Maximo de 2000 caracteres').nullish(),
}

export const createLeadSchema = z.object({
  ...leadFields,
  status: leadFields.status.default('new'),
  valueCents: leadFields.valueCents.default(0),
})

export type CreateLeadInput = z.infer<typeof createLeadSchema>

/**
 * ATENCAO: `createLeadSchema.partial()` NAO serve aqui. O `.partial()` torna o
 * campo opcional mas preserva o `.default()`, entao um PATCH `{status}` sem
 * `valueCents` receberia `valueCents: 0` e zeraria o valor do lead no banco.
 * Por isso a atualizacao parcial nasce dos campos sem default.
 */
export const updateLeadSchema = z.object(leadFields).partial()
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>

/* -------------------------------------------------------------------------- */
/* Filtros da listagem                                                        */
/* -------------------------------------------------------------------------- */

export const LEAD_SORT_FIELDS = ['createdAt', 'name', 'valueCents'] as const
export const leadSortSchema = z.enum(LEAD_SORT_FIELDS)
export type LeadSort = z.infer<typeof leadSortSchema>

/**
 * Usado nos dois lados:
 *  - Fastify valida a querystring com ele
 *  - TanStack Router valida os search params da URL com ele
 * Por isso o `coerce`: em ambos os casos os valores chegam como string.
 */
export const listLeadsQuerySchema = z.object({
  q: z.string().max(120).optional(),
  status: leadStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  sort: leadSortSchema.default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>

export const paginationMetaSchema = z.object({
  page: z.int(),
  perPage: z.int(),
  total: z.int(),
  totalPages: z.int(),
})

export const listLeadsResponseSchema = z.object({
  data: z.array(leadSchema),
  meta: paginationMetaSchema,
})

export type ListLeadsResponse = z.infer<typeof listLeadsResponseSchema>

/* -------------------------------------------------------------------------- */
/* Metricas do topo do dashboard                                              */
/* -------------------------------------------------------------------------- */

export const leadStatsSchema = z.object({
  total: z.int(),
  openCount: z.int(),
  openValueCents: z.int(),
  wonValueCents: z.int(),
  byStatus: z.array(
    z.object({
      status: leadStatusSchema,
      count: z.int(),
      valueCents: z.int(),
    }),
  ),
})

export type LeadStats = z.infer<typeof leadStatsSchema>
