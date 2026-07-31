import { INTERACTION_TYPES, LEAD_STATUSES, USER_ROLES } from '@pipe/shared'
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
export const userRoleEnum = pgEnum('user_role', USER_ROLES)

/* -------------------------------------------------------------------------- */
/* Autenticacao                                                               */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    /** Hash Argon2id. A senha em claro nunca chega a este pacote. */
    passwordHash: text('password_hash').notNull(),
    role: userRoleEnum('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
)

/**
 * Um registro por refresh token emitido.
 *
 * Guarda o SHA-256 do token, nunca o valor original: um vazamento do banco nao
 * entrega sessao nenhuma. O token e opaco (bytes aleatorios), entao um hash
 * rapido basta — nao ha o que adivinhar por forca bruta, ao contrario de senha.
 *
 * `familyId` liga a cadeia de rotacoes que nasceu de um mesmo login. Se um
 * token ja rotacionado for apresentado de novo, e sinal de roubo: derrubamos a
 * familia inteira em vez de so recusar aquela requisicao.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Preenchido na rotacao, no logout ou quando a familia e revogada. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(table.tokenHash),
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_family_id_idx').on(table.familyId),
  ],
)

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Uso unico: preenchido no primeiro reset bem-sucedido. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_key').on(table.tokenHash),
    index('password_reset_tokens_user_id_idx').on(table.userId),
  ],
)

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

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}))

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}))

/** Tipos inferidos direto do schema — sem codegen. */
export type UserRow = typeof users.$inferSelect
export type NewUserRow = typeof users.$inferInsert
export type RefreshTokenRow = typeof refreshTokens.$inferSelect
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect
export type LeadRow = typeof leads.$inferSelect
export type NewLeadRow = typeof leads.$inferInsert
export type InteractionRow = typeof interactions.$inferSelect
export type NewInteractionRow = typeof interactions.$inferInsert
