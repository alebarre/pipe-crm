import { USER_ROLE_LABELS } from '@pipe/shared'
import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { LogOut, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sessionQuery, useLogout, useSession } from '@/lib/session'

/**
 * Guarda de rota.
 *
 * `_authed` e uma rota "pathless": nao acrescenta nada a URL (/leads continua
 * /leads), so envolve as telas internas do app. Tudo que ficar em
 * routes/_authed/ passa por aqui antes de renderizar.
 *
 * A checagem roda no `beforeLoad`, antes de montar componente ou disparar
 * loader — quem nao tem sessao nunca chega a ver a tela nem a fazer as queries
 * dela. Vale lembrar que isto e navegacao, nao seguranca: quem editar o estado
 * do router no navegador ate ve a casca da pagina, mas a API responde 401 em
 * todas as chamadas. Autorizacao de verdade so existe no servidor.
 */
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    try {
      // `ensureQueryData` reaproveita o cache do React Query, entao navegar
      // entre telas protegidas nao dispara um /auth/me a cada passo.
      const { user } = await context.queryClient.ensureQueryData(sessionQuery())
      return { user }
    } catch {
      throw redirect({
        to: '/login',
        // Guarda para onde a pessoa queria ir: depois do login ela volta pra
        // ca, em vez de cair sempre na home.
        search: { redirect: location.href },
      })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function AppHeader() {
  const { user } = useSession()
  const logout = useLogout()
  const navigate = useNavigate()

  return (
    <header className="border-b border-line bg-surface-raised">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
        <Waypoints className="h-5 w-5 shrink-0 text-brand" />
        <Link to="/leads" className="font-semibold tracking-tight">
          Pipe <span className="font-normal text-ink-muted">CRM</span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user && (
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user.name}</div>
              <div className="text-xs text-ink-muted">{USER_ROLE_LABELS[user.role]}</div>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            title="Sair"
            disabled={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate({ to: '/login', search: { redirect: undefined } }),
              })
            }
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  )
}
