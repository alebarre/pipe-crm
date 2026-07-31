import {
  formatCents,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadSort,
  listLeadsQuerySchema,
} from '@pipe/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/field'
import { LeadForm } from '@/features/lead-form'
import { ApiError } from '@/lib/api'
import { leadsQuery, statsQuery, useCreateLead } from '@/lib/queries'
import { useSession } from '@/lib/session'
import { relativeDays } from '@/lib/utils'

export const Route = createFileRoute('/_authed/leads/')({
  // Os search params da URL sao validados pelo MESMO schema que valida a
  // querystring no Fastify. `search` chega tipado e com os defaults aplicados.
  validateSearch: listLeadsQuerySchema,
  component: LeadsPage,
})

const SORT_LABELS: Record<LeadSort, string> = {
  createdAt: 'Mais recentes',
  name: 'Nome',
  valueCents: 'Valor',
}

function LeadsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const leads = useQuery(leadsQuery(search))
  const stats = useQuery(statsQuery())

  // O papel decide o que aparece; a API decide o que acontece. Esconder o
  // botao e conveniencia — sem `admin`, o POST volta 403 de qualquer jeito.
  const { canManageLeads } = useSession()

  const [creating, setCreating] = useState(false)
  const createLead = useCreateLead()

  // Campo de busca controlado localmente e empurrado para a URL com atraso,
  // para nao disparar uma query por tecla.
  const [term, setTerm] = useState(search.q ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = term.trim() || undefined
      if (next !== search.q) {
        navigate({ search: (prev) => ({ ...prev, q: next, page: 1 }) })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [term, search.q, navigate])

  const meta = leads.data?.meta

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-ink-muted">Pipeline comercial</p>
        </div>
        {canManageLeads && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Novo lead
          </Button>
        )}
      </div>

      {/* Metricas */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Leads no total" value={stats.data ? String(stats.data.total) : '—'} />
        <StatCard
          label="Pipeline aberto"
          value={stats.data ? formatCents(stats.data.openValueCents) : '—'}
          detail={stats.data ? `${stats.data.openCount} em aberto` : undefined}
        />
        <StatCard
          label="Ganho"
          value={stats.data ? formatCents(stats.data.wonValueCents) : '—'}
          detail={
            stats.data
              ? `${stats.data.byStatus.find((s) => s.status === 'won')?.count ?? 0} fechados`
              : undefined
          }
        />
      </div>

      {/* Filtros — todos vivem na URL, entao sobrevivem a refresh e sao linkaveis */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, e-mail ou empresa"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
        </div>

        <Select
          className="w-44"
          value={search.status ?? ''}
          onChange={(event) =>
            navigate({
              search: (prev) => ({
                ...prev,
                status: event.target.value === '' ? undefined : (event.target.value as never),
                page: 1,
              }),
            })
          }
        >
          <option value="">Todos os status</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEAD_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        <Select
          className="w-44"
          value={search.sort}
          onChange={(event) =>
            navigate({
              search: (prev) => ({
                ...prev,
                sort: event.target.value as LeadSort,
                order: event.target.value === 'name' ? 'asc' : 'desc',
                page: 1,
              }),
            })
          }
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface-raised">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Criado</th>
              </tr>
            </thead>
            <tbody>
              {leads.isPending && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    Carregando...
                  </td>
                </tr>
              )}

              {leads.isError && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-red-600">
                    {leads.error instanceof ApiError ? leads.error.message : 'Falha ao carregar.'}
                  </td>
                </tr>
              )}

              {leads.data?.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-muted">
                    Nenhum lead encontrado com esses filtros.
                  </td>
                </tr>
              )}

              {leads.data?.data.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-line last:border-0 hover:bg-brand-soft/60"
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: lead.id }}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {lead.name}
                    </Link>
                    <div className="text-xs text-ink-muted">{lead.company ?? lead.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCents(lead.valueCents)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{relativeDays(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-ink-muted">
              {meta.total} {meta.total === 1 ? 'lead' : 'leads'} · pagina {meta.page} de{' '}
              {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page <= 1}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: prev.page - 1 }) })}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}
              >
                Proxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Novo lead"
        description="As mesmas regras de validacao do servidor."
      >
        <LeadForm
          submitLabel="Criar lead"
          pending={createLead.isPending}
          serverError={createLead.error instanceof ApiError ? createLead.error.message : null}
          onCancel={() => setCreating(false)}
          onSubmit={(values) =>
            createLead.mutate(values, {
              onSuccess: () => {
                createLead.reset()
                setCreating(false)
              },
            })
          }
        />
      </Dialog>
    </div>
  )
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="text-xs text-ink-muted">{detail}</div>}
    </div>
  )
}
