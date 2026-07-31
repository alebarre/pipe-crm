import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserRole,
} from '@pipe/shared'
import { canManageLeads } from '@pipe/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export const sessionKey = ['session'] as const

/**
 * Quem esta logado, segundo o servidor.
 *
 * O front nao guarda usuario em localStorage nem le o token (que e httpOnly):
 * a fonte de verdade e sempre esta chamada. `retry: false` porque um 401 aqui
 * e resposta, nao falha de rede — insistir so atrasaria a ida para o login.
 */
export const sessionQuery = () =>
  queryOptions({
    queryKey: sessionKey,
    queryFn: () => api.me(),
    retry: false,
    staleTime: 5 * 60_000,
  })

export function useSession() {
  const { data } = useQuery(sessionQuery())
  const role: UserRole | undefined = data?.user.role

  return {
    user: data?.user,
    role,
    /** Atalho de UI. A regra que vale continua sendo a do servidor. */
    canManageLeads: canManageLeads(role),
  }
}

/**
 * Depois de entrar ou sair, o cache inteiro e descartado.
 *
 * Trocar de usuario sem limpar deixaria na tela dados carregados pela sessao
 * anterior — e, no caso do logout, dados que a proxima pessoa no mesmo
 * navegador nao deveria ver.
 */
function useResetCache() {
  const queryClient = useQueryClient()

  return async () => {
    queryClient.clear()
    await queryClient.invalidateQueries()
  }
}

export function useLogin() {
  const reset = useResetCache()
  return useMutation({
    mutationFn: (input: LoginInput) => api.login(input),
    onSuccess: reset,
  })
}

export function useRegister() {
  const reset = useResetCache()
  return useMutation({
    mutationFn: (input: RegisterInput) => api.register(input),
    onSuccess: reset,
  })
}

export function useLogout() {
  const reset = useResetCache()
  return useMutation({
    mutationFn: () => api.logout(),
    // Mesmo que a chamada falhe, a sessao local vai embora: o cookie ja pode
    // ter expirado, e manter a tela como se o usuario seguisse logado e pior.
    onSettled: reset,
  })
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => api.forgotPassword(input),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => api.resetPassword(input),
  })
}
