import { zodResolver } from '@hookform/resolvers/zod'
import {
  type CreateLeadInput,
  createLeadSchema,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  parseCurrencyToCents,
} from '@pipe/shared'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/field'

type LeadFormProps = {
  defaultValues?: Partial<CreateLeadInput>
  submitLabel: string
  pending?: boolean
  serverError?: string | null
  onCancel?: () => void
  onSubmit: (values: CreateLeadInput) => void
}

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

export function LeadForm({
  defaultValues,
  submitLabel,
  pending,
  serverError,
  onCancel,
  onSubmit,
}: LeadFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    // O MESMO schema que o Fastify usa para validar o corpo da requisicao.
    // Regra de negocio nova entra em @pipe/shared e vale nos dois lados.
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      email: defaultValues?.email ?? '',
      company: defaultValues?.company ?? '',
      status: defaultValues?.status ?? 'new',
      valueCents: defaultValues?.valueCents ?? 0,
      notes: defaultValues?.notes ?? '',
    },
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit((values) => onSubmit(values))}>
      <Field label="Nome" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoFocus placeholder="Nome do contato" {...register('name')} />
      </Field>

      <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" placeholder="contato@empresa.com" {...register('email')} />
      </Field>

      <Field label="Empresa" htmlFor="company" error={errors.company?.message}>
        <Input id="company" placeholder="Opcional" {...register('company')} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Status" htmlFor="status" error={errors.status?.message}>
          <Select id="status" {...register('status')}>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {LEAD_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Valor (R$)"
          htmlFor="valueCents"
          error={errors.valueCents?.message}
          hint="Guardado em centavos"
        >
          <Input
            id="valueCents"
            inputMode="decimal"
            defaultValue={centsToInput(defaultValues?.valueCents ?? 0)}
            {...register('valueCents', {
              // Converte '1.234,56' -> 123456 antes da validacao do Zod.
              setValueAs: (value) => parseCurrencyToCents(String(value ?? '')),
            })}
          />
        </Field>
      </div>

      <Field label="Notas" htmlFor="notes" error={errors.notes?.message}>
        <Textarea id="notes" placeholder="Contexto, proximos passos..." {...register('notes')} />
      </Field>

      {serverError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando...' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
