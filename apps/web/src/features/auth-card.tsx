import { Waypoints } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Moldura comum das telas de sessao (login, cadastro e recuperacao).
 *
 * Elas ficam fora do layout do app — sem cabecalho e sem menu — porque quem
 * chega ate aqui ainda nao tem sessao, e mostrar a casca do produto para
 * alguem deslogado so gera link que nao leva a lugar nenhum.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Waypoints className="h-6 w-6 text-brand" />
          <span className="text-lg font-semibold tracking-tight">
            Pipe <span className="font-normal text-ink-muted">CRM</span>
          </span>
        </div>

        <div className="rounded-xl border border-line bg-surface-raised p-6">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}

          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
      </div>
    </div>
  )
}

/** Erro vindo do servidor, no mesmo formato usado nos formularios do app. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null

  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
      {message}
    </p>
  )
}

export function FormSuccess({ message }: { message?: string | null }) {
  if (!message) return null

  return (
    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
      {message}
    </p>
  )
}
