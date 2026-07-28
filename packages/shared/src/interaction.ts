import { z } from 'zod'
import { leadSchema } from './lead.ts'

export const INTERACTION_TYPES = ['call', 'email', 'meeting', 'note'] as const

export const interactionTypeSchema = z.enum(INTERACTION_TYPES)
export type InteractionType = z.infer<typeof interactionTypeSchema>

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  call: 'Ligacao',
  email: 'E-mail',
  meeting: 'Reuniao',
  note: 'Anotacao',
}

export const interactionSchema = z.object({
  id: z.uuid(),
  leadId: z.uuid(),
  type: interactionTypeSchema,
  content: z.string(),
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
})

export type Interaction = z.infer<typeof interactionSchema>

export const createInteractionSchema = z.object({
  type: interactionTypeSchema,
  content: z.string().trim().min(1, 'Escreva alguma coisa').max(2000, 'Maximo de 2000 caracteres'),
  occurredAt: z.iso.datetime().optional(),
})

export type CreateInteractionInput = z.infer<typeof createInteractionSchema>

/** GET /leads/:id devolve o lead junto da timeline. */
export const leadDetailSchema = leadSchema.extend({
  interactions: z.array(interactionSchema),
})

export type LeadDetail = z.infer<typeof leadDetailSchema>
