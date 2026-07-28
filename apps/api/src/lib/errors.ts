/**
 * Violacao de unique constraint (SQLSTATE 23505).
 *
 * O Drizzle embrulha o erro do driver em DrizzleQueryError, entao o codigo
 * original fica em `.cause` — as vezes mais de um nivel abaixo. Por isso o
 * percurso pela cadeia em vez de olhar so o erro de cima.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error

  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current !== 'object') return false

    if ((current as { code?: unknown }).code === '23505') return true

    const message = (current as { message?: unknown }).message
    if (typeof message === 'string' && /duplicate key value/i.test(message)) return true

    current = (current as { cause?: unknown }).cause
  }

  return false
}
