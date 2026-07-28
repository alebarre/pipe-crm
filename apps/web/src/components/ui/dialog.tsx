import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import { Button } from './button'

type DialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

/**
 * Usa o <dialog> nativo: foco preso, Esc e backdrop sem biblioteca.
 * Quando o app crescer, trocar por Radix/shadcn e uma substituicao local.
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o onClick so fecha ao clicar no backdrop; o equivalente por teclado (Esc) ja vem do <dialog> nativo pelo onClose
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface-raised p-0 text-ink backdrop:bg-black/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
