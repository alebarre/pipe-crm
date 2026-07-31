import type { InteractionRow, LeadRow, UserRow } from '@pipe/db'
import type { Interaction, Lead, User } from '@pipe/shared'

/**
 * A linha do banco nao e o contrato da API. Este e o unico lugar que faz a
 * traducao — inclusive Date -> string ISO, que os schemas de resposta exigem.
 */
const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    status: row.status,
    valueCents: row.valueCents,
    notes: row.notes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

/**
 * `passwordHash` nao esta aqui, e nao e esquecimento: como a resposta e
 * montada campo a campo, um dado sensivel novo na tabela nao vaza sozinho
 * para a API. O `userSchema` do Fastify barraria de todo jeito, mas a defesa
 * boa e a que nao depende de outra camada lembrar.
 */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: iso(row.createdAt),
  }
}

export function toInteraction(row: InteractionRow): Interaction {
  return {
    id: row.id,
    leadId: row.leadId,
    type: row.type,
    content: row.content,
    occurredAt: iso(row.occurredAt),
    createdAt: iso(row.createdAt),
  }
}
