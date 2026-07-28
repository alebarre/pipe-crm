import { describe, expect, it } from 'vitest'
import { formatCents, parseCurrencyToCents } from './common.ts'
import { createLeadSchema, listLeadsQuerySchema, updateLeadSchema } from './lead.ts'

describe('createLeadSchema', () => {
  it('normaliza espacos e caixa', () => {
    const parsed = createLeadSchema.parse({
      name: '  Ana Souza  ',
      email: '  ANA@ACME.COM ',
      company: '  Acme  ',
    })

    expect(parsed).toMatchObject({
      name: 'Ana Souza',
      email: 'ana@acme.com',
      company: 'Acme',
    })
  })

  it('aplica os defaults de status e valor', () => {
    const parsed = createLeadSchema.parse({ name: 'Ana Souza', email: 'ana@acme.com' })

    expect(parsed.status).toBe('new')
    expect(parsed.valueCents).toBe(0)
  })

  it('recusa nome so com espacos', () => {
    const result = createLeadSchema.safeParse({ name: '     ', email: 'ana@acme.com' })

    expect(result.success).toBe(false)
  })

  it('recusa valor negativo e valor fracionado', () => {
    expect(
      createLeadSchema.safeParse({ name: 'Ana Souza', email: 'a@b.com', valueCents: -1 }).success,
    ).toBe(false)
    expect(
      createLeadSchema.safeParse({ name: 'Ana Souza', email: 'a@b.com', valueCents: 10.5 }).success,
    ).toBe(false)
  })
})

describe('updateLeadSchema', () => {
  it('aceita atualizacao parcial', () => {
    const parsed = updateLeadSchema.parse({ status: 'won' })

    expect(parsed).toEqual({ status: 'won' })
  })
})

describe('listLeadsQuerySchema', () => {
  it('converte querystring (tudo string) para os tipos certos', () => {
    const parsed = listLeadsQuerySchema.parse({ page: '3', perPage: '50', status: 'qualified' })

    expect(parsed).toMatchObject({ page: 3, perPage: 50, status: 'qualified' })
  })

  it('preenche os defaults de ordenacao e pagina', () => {
    const parsed = listLeadsQuerySchema.parse({})

    expect(parsed).toEqual({ page: 1, perPage: 20, sort: 'createdAt', order: 'desc' })
  })

  it('limita perPage para nao deixar o cliente pedir a base inteira', () => {
    expect(listLeadsQuerySchema.safeParse({ perPage: '5000' }).success).toBe(false)
  })
})

describe('dinheiro', () => {
  it('converte texto em centavos', () => {
    expect(parseCurrencyToCents('1.234,56')).toBe(123456)
    expect(parseCurrencyToCents('R$ 1.234,56')).toBe(123456)
    expect(parseCurrencyToCents('99')).toBe(9900)
    expect(parseCurrencyToCents('')).toBe(0)
    expect(parseCurrencyToCents('abc')).toBe(0)
  })

  it('formata centavos sem perder precisao', () => {
    //   e o espaco nao separavel que o Intl usa depois do simbolo
    expect(formatCents(123456).replace(/ /g, ' ')).toBe('R$ 1.234,56')
    expect(formatCents(0).replace(/ /g, ' ')).toBe('R$ 0,00')
  })
})
