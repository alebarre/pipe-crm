import type {
  CreateInteractionInput,
  CreateLeadInput,
  ListLeadsQuery,
  UpdateLeadInput,
} from '@pipe/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export const leadKeys = {
  all: ['leads'] as const,
  lists: () => [...leadKeys.all, 'list'] as const,
  list: (query: ListLeadsQuery) => [...leadKeys.lists(), query] as const,
  details: () => [...leadKeys.all, 'detail'] as const,
  detail: (id: string) => [...leadKeys.details(), id] as const,
  stats: () => [...leadKeys.all, 'stats'] as const,
}

export const leadsQuery = (query: ListLeadsQuery) =>
  queryOptions({
    queryKey: leadKeys.list(query),
    queryFn: () => api.listLeads(query),
  })

export const leadQuery = (id: string) =>
  queryOptions({
    queryKey: leadKeys.detail(id),
    queryFn: () => api.getLead(id),
  })

export const statsQuery = () =>
  queryOptions({
    queryKey: leadKeys.stats(),
    queryFn: () => api.stats(),
  })

/**
 * Toda mutacao invalida `leadKeys.all`. E a estrategia mais grosseira e, num
 * app deste tamanho, a certa: nao ha cache velho possivel e o custo e uma
 * refetch das queries montadas. Otimizar isso vem depois de doer.
 */
function useInvalidateLeads() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: leadKeys.all })
}

export function useCreateLead() {
  const invalidate = useInvalidateLeads()
  return useMutation({
    mutationFn: (input: CreateLeadInput) => api.createLead(input),
    onSuccess: invalidate,
  })
}

export function useUpdateLead(id: string) {
  const invalidate = useInvalidateLeads()
  return useMutation({
    mutationFn: (input: UpdateLeadInput) => api.updateLead(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteLead() {
  const invalidate = useInvalidateLeads()
  return useMutation({
    mutationFn: (id: string) => api.deleteLead(id),
    onSuccess: invalidate,
  })
}

export function useAddInteraction(leadId: string) {
  const invalidate = useInvalidateLeads()
  return useMutation({
    mutationFn: (input: CreateInteractionInput) => api.addInteraction(leadId, input),
    onSuccess: invalidate,
  })
}
