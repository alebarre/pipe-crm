import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { Waypoints } from 'lucide-react'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-16 text-center">
      <h1 className="text-lg font-semibold">Pagina nao encontrada</h1>
      <Link to="/leads" className="mt-3 inline-block text-sm text-brand hover:underline">
        Voltar para os leads
      </Link>
    </div>
  ),
})

function RootLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-6">
          <Waypoints className="h-5 w-5 text-brand" />
          <Link to="/leads" className="font-semibold tracking-tight">
            Pipe <span className="text-ink-muted font-normal">CRM</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
