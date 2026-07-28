import { INTERACTION_TYPES, LEAD_STATUSES } from '@pipe/shared'
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Os enums do Postgres nascem das constantes de @pipe/shared.
 * Acrescentar um status la quebra o build aqui ate voce gerar a migration.
 */
export const leadStatusEnum = pgEnum('lead_status', LEAD_STATUSES)
export const interactionTypeEnum = pgEnum('interaction_type', INTERACTION_TYPES)

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    company: text('company'),
    status: leadStatusEnum('status').notNull().default('new'),
    valueCents: integer('value_cents').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('leads_email_key').on(table.email),
    index('leads_status_idx').on(table.status),
    index('leads_created_at_idx').on(table.createdAt),
  ],
)

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: interactionTypeEnum('type').notNull(),
    content: text('content').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('interactions_lead_id_idx').on(table.leadId, table.occurredAt)],
)

export const leadsRelations = relations(leads, ({ many }) => ({
  interactions: many(interactions),
}))

export const interactionsRelations = relations(interactions, ({ one }) => ({
  lead: one(leads, {
    fields: [interactions.leadId],
    references: [leads.id],
  }),
}))

/** Tipos inferidos direto do schema — sem codegen. */
export type LeadRow = typeof leads.$inferSelect
export type NewLeadRow = typeof leads.$inferInsert
export type InteractionRow = typeof interactions.$inferSelect
export type NewInteractionRow = typeof interactions.$inferInsert
