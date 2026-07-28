import type { InteractionRow, LeadRow } from '@pipe/db'
import type { Interaction, Lead } from '@pipe/shared'

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
