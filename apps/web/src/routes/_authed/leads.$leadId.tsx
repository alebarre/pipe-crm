import { zodResolver } from '@hookform/resolvers/zod'
import {
  createInteractionSchema,
  formatCents,
  INTERACTION_TYPE_LABELS,
  INTERACTION_TYPES,
  type InteractionType,
} from '@pipe/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, CalendarClock, Mail, Phone, StickyNote, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Select, Textarea } from '@/components/ui/field'
import { LeadForm } from '@/features/lead-form'
import { ApiError } from '@/lib/api'
import { leadQuery, useAddInteraction, useDeleteLead, useUpdateLead } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { formatDate, formatDateTime } from '@/lib/utils'

export const Route = createFileRoute('/_authed/leads/$leadId')({
  component: LeadDetailPage,
})

const ICONS: Record<InteractionType, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
  note: StickyNote,
}

function LeadDetailPage() {
  const { leadId } = Route.useParams()
  const navigate = useNavigate()

  const lead = useQuery(leadQuery(leadId))
  const updateLead = useUpdateLead(leadId)
  const deleteLead = useDeleteLead()

  // Editar e remover sao de admin. Registrar interacao, nao: o formulario da
  // timeline continua na tela para os dois papeis.
  const { canManageLeads } = useSession()

  const [editing, setEditing] = useState(false)

  if (lead.isPending) {
    return <p className="py-16 text-center text-ink-muted">Carregando...</p>
  }

  if (lead.isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-red-600">
          {lead.error instanceof ApiError ? lead.error.message : 'Falha ao carregar o lead.'}
        </p>
        <Link to="/leads" className="mt-3 inline-block text-sm text-brand hover:underline">
          Voltar para a lista
        </Link>
      </div>
    )
  }

  const data = lead.data

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/leads"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{data.name}</h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {data.company ? `${data.company} · ` : ''}
            {data.email}
          </p>
        </div>

        {canManageLeads && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button
              variant="danger"
              disabled={deleteLead.isPending}
              onClick={() => {
                if (!confirm(`Remover o lead "${data.name}"? As interacoes vao junto.`)) return
                deleteLead.mutate(data.id, { onSuccess: () => navigate({ to: '/leads' }) })
              }}
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-surface-raised p-5">
            <h2 className="text-sm font-semibold">Registrar interacao</h2>
            <InteractionForm leadId={data.id} />
          </section>

          <section className="rounded-xl border border-line bg-surface-raised p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Timeline
              <span className="ml-2 font-normal text-ink-muted">
                {data.interactions.length}{' '}
                {data.interactions.length === 1 ? 'registro' : 'registros'}
              </span>
            </h2>

            {data.interactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">
                Nenhuma interacao registrada ainda.
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {data.interactions.map((interaction) => {
                  const Icon = ICONS[interaction.type]
                  return (
                    <li key={interaction.id} className="flex gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">
                            {INTERACTION_TYPE_LABELS[interaction.type]}
                          </span>
                          <span className="shrink-0 text-xs text-ink-muted">
                            {formatDateTime(interaction.occurredAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-muted">
                          {interaction.content}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex h-fit flex-col gap-3 rounded-xl border border-line bg-surface-raised p-5 text-sm">
          <Detail label="Valor" value={formatCents(data.valueCents)} />
          <Detail label="Criado em" value={formatDate(data.createdAt)} />
          <Detail label="Atualizado em" value={formatDate(data.updatedAt)} />
          {data.notes && (
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Notas</div>
              <p className="mt-1 whitespace-pre-wrap">{data.notes}</p>
            </div>
          )}
        </aside>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Editar lead">
        <LeadForm
          submitLabel="Salvar alteracoes"
          pending={updateLead.isPending}
          serverError={updateLead.error instanceof ApiError ? updateLead.error.message : null}
          defaultValues={{
            name: data.name,
            email: data.email,
            company: data.company,
            status: data.status,
            valueCents: data.valueCents,
            notes: data.notes,
          }}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            updateLead.mutate(values, {
              onSuccess: () => {
                updateLead.reset()
                setEditing(false)
              },
            })
          }
        />
      </Dialog>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  )
}

function InteractionForm({ leadId }: { leadId: string }) {
  const addInteraction = useAddInteraction(leadId)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createInteractionSchema),
    defaultValues: { type: 'call' as InteractionType, content: '' },
  })

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={handleSubmit((values) =>
        addInteraction.mutate(values, { onSuccess: () => reset() }),
      )}
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Tipo" htmlFor="type" error={errors.type?.message}>
          <Select id="type" {...register('type')}>
            {INTERACTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {INTERACTION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="O que aconteceu" htmlFor="content" error={errors.content?.message}>
          <Textarea id="content" placeholder="Resumo da conversa..." {...register('content')} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3">
        {addInteraction.error instanceof ApiError && (
          <span className="text-sm text-red-600">{addInteraction.error.message}</span>
        )}
        <Button type="submit" size="sm" disabled={addInteraction.isPending}>
          <CalendarClock className="h-4 w-4" />
          {addInteraction.isPending ? 'Registrando...' : 'Registrar'}
        </Button>
      </div>
    </form>
  )
}
