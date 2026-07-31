import {
  apiErrorSchema,
  type CreateInteractionInput,
  type CreateLeadInput,
  type ForgotPasswordInput,
  interactionSchema,
  type ListLeadsQuery,
  type LoginInput,
  leadDetailSchema,
  leadSchema,
  leadStatsSchema,
  listLeadsResponseSchema,
  messageSchema,
  type RegisterInput,
  type ResetPasswordInput,
  sessionSchema,
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

/**
 * Renovacao de sessao em voo.
 *
 * Sem isto, uma tela que dispara tres queries ao montar tomaria tres 401 e
 * pediria tres refresh em paralelo. Como o servidor rotaciona o token a cada
 * uso, o segundo pedido chegaria com um token ja rotacionado — que a API trata
 * (corretamente) como sinal de roubo e derruba a sessao inteira. Ou seja: sem
 * fila, o proprio app deslogaria o usuario sozinho.
 *
 * Com a promessa compartilhada, as chamadas simultaneas esperam o mesmo
 * refresh e so entao repetem a requisicao original.
 */
let refreshing: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE_URL}/auth/refresh`, { method: 'POST' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })

  return refreshing
}

/**
 * Rotas onde 401 e a resposta em si, e nao um token vencido: credencial
 * errada no login e o proprio refresh recusado. Tentar renovar nesses casos
 * seria, no melhor cenario, uma requisicao inutil — e no do refresh, recursao.
 *
 * `/auth/me` fica de fora desta lista de proposito: e exatamente a chamada que
 * abre o app, e um access token vencido ali tem de ser renovado em silencio,
 * sob pena de mandar para o login quem tem sessao valida.
 */
const NEVER_RETRY = ['/auth/login', '/auth/register', '/auth/refresh']

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      // Só declara o tipo do corpo quando existe corpo. Mandar
      // `content-type: application/json` num DELETE sem body faz o Fastify
      // responder 400 ("Body cannot be empty when content-type is set...").
      ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  })
}

async function call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  let response = await request(path, init)

  // O access token dura 15 minutos; o refresh, dias. Quando o primeiro vence,
  // o usuario nao precisa saber: renova e repete a requisicao uma unica vez.
  if (response.status === 401 && !NEVER_RETRY.includes(path)) {
    const renewed = await refreshSession()
    if (renewed) response = await request(path, init)
  }

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
  /* ------------------------------------------------------------------ */
  /* Sessao                                                             */
  /*                                                                    */
  /* Nenhuma destas funcoes devolve token: o par access/refresh viaja em */
  /* cookie httpOnly, invisivel para este código. O que volta e o        */
  /* usuario — o suficiente para a interface saber quem esta logado.     */
  /* ------------------------------------------------------------------ */

  login: (input: LoginInput) =>
    call('/auth/login', sessionSchema, { method: 'POST', body: JSON.stringify(input) }),

  register: (input: RegisterInput) =>
    call('/auth/register', sessionSchema, { method: 'POST', body: JSON.stringify(input) }),

  logout: () => call('/auth/logout', noContent, { method: 'POST' }),

  me: () => call('/auth/me', sessionSchema),

  forgotPassword: (input: ForgotPasswordInput) =>
    call('/auth/forgot-password', messageSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  resetPassword: (input: ResetPasswordInput) =>
    call('/auth/reset-password', messageSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /* ------------------------------------------------------------------ */
  /* Leads                                                              */
  /* ------------------------------------------------------------------ */

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
