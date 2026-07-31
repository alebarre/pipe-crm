import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'

/**
 * A raiz nao desenha mais o cabecalho: ele so faz sentido para quem esta
 * logado, e as telas de login, cadastro e recuperacao ficam fora do layout do
 * app. Quem cuida do cabecalho agora e a rota `_authed`.
 */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-16 text-center">
      <h1 className="text-lg font-semibold">Pagina nao encontrada</h1>
      <Link to="/leads" className="mt-3 inline-block text-sm text-brand hover:underline">
        Voltar para os leads
      </Link>
    </div>
  ),
})
