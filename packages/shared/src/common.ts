import { z } from 'zod'

export const idParamSchema = z.object({
  id: z.uuid('Identificador invalido'),
})

/** Formato unico de erro devolvido pela API. */
export const apiErrorSchema = z.object({
  statusCode: z.int(),
  error: z.string(),
  message: z.string(),
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export function formatCents(cents: number, locale = 'pt-BR', currency = 'BRL'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}

/** '1.234,56' | 'R$ 1.234,56' | '1234.56' -> 123456 */
export function parseCurrencyToCents(input: string): number {
  const cleaned = input.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}
