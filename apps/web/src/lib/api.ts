import {
  apiErrorSchema,
  type CreateInteractionInput,
  type CreateLeadInput,
  interactionSchema,
  type ListLeadsQuery,
  leadDetailSchema,
  leadSchema,
  leadStatsSchema,
  listLeadsResponseSchema,
  type UpdateLeadInput,
} from '@pipe/shared'
import { z } from 'zod'

export class ApiError extends Error {
  readonly status: number
  readonly details: Array<{ path: string; message: string }>

  constructor(
    status: number,
    message: string,
    details: Array<{ path: string; message: string }> = [],
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Em dev o Vite faz proxy de /api para a API; em producao o front e servido
 * atras do mesmo dominio. Em ambos os casos a URL e relativa — nunca ha
 * requisicao cross-origin, entao nao ha cookie SameSite=None para gerenciar.
 */
const BASE_URL = '/api'

async function call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })

  const payload = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload)
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.message : `Falha na requisicao (HTTP ${response.status}).`,
      parsed.success ? (parsed.data.details ?? []) : [],
    )
  }

  // A mesma definicao que o servidor usou para serializar valida aqui na
  // entrada. Se os dois lados saírem de sincronia, o erro aparece na hora.
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new ApiError(500, 'A resposta da API nao corresponde ao contrato compartilhado.')
  }

  return parsed.data
}

function toSearchParams(query: ListLeadsQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

/** 204 nao tem corpo: o `payload` vira null e este schema o aceita. */
const noContent = z.null()

export const api = {
  listLeads: (query: ListLeadsQuery) =>
    call(`/leads?${toSearchParams(query)}`, listLeadsResponseSchema),

  stats: () => call('/leads/stats', leadStatsSchema),

  getLead: (id: string) => call(`/leads/${id}`, leadDetailSchema),

  createLead: (input: CreateLeadInput) =>
    call('/leads', leadSchema, { method: 'POST', body: JSON.stringify(input) }),

  updateLead: (id: string, input: UpdateLeadInput) =>
    call(`/leads/${id}`, leadSchema, { method: 'PATCH', body: JSON.stringify(input) }),

  deleteLead: (id: string) => call(`/leads/${id}`, noContent, { method: 'DELETE' }),

  addInteraction: (leadId: string, input: CreateInteractionInput) =>
    call(`/leads/${leadId}/interactions`, interactionSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
}
