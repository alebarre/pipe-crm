import { zodResolver } from '@hookform/resolvers/zod'
import { resetPasswordFormSchema } from '@pipe/shared'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthCard, FormError } from '@/features/auth-card'
import { ApiError } from '@/lib/api'
import { useResetPassword } from '@/lib/session'

/**
 * O token chega pela URL do e-mail: /reset-password?token=...
 *
 * Ele nao e validado aqui — quem sabe se vale, se ja foi usado ou se expirou e
 * o servidor. A tela so o repassa e mostra a resposta.
 */
export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const reset = useResetPassword()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { token: token ?? '', password: '', confirmPassword: '' },
  })

  if (!token) {
    return (
      <AuthCard
        title="Link incompleto"
        description="Este endereco nao traz o token de redefinicao. Peca um link novo."
        footer={
          <Link to="/forgot-password" className="text-brand hover:underline">
            Pedir novo link
          </Link>
        }
      >
        <p className="text-sm text-ink-muted">
          Abra o link exatamente como ele chegou no e-mail — o token faz parte do endereco.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Nova senha"
      description="Depois de trocar, as sessoes abertas em outros aparelhos caem."
      footer={
        <Link to="/login" search={{ redirect: undefined }} className="text-brand hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          reset.mutate(
            { token: values.token, password: values.password },
            {
              // A API ja invalidou tudo; o proximo passo e entrar com a nova.
              onSuccess: () => navigate({ to: '/login', search: { redirect: undefined } }),
            },
          ),
        )}
      >
        <input type="hidden" {...register('token')} />

        <Field
          label="Nova senha"
          htmlFor="password"
          error={errors.password?.message}
          hint="Ao menos 8 caracteres"
        >
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="new-password"
            {...register('password')}
          />
        </Field>

        <Field
          label="Confirme a nova senha"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
          />
        </Field>

        <FormError message={reset.error instanceof ApiError ? reset.error.message : null} />

        <Button type="submit" disabled={reset.isPending}>
          {reset.isPending ? 'Salvando...' : 'Salvar nova senha'}
        </Button>
      </form>
    </AuthCard>
  )
}
