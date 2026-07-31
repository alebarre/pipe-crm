import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema } from '@pipe/shared'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthCard, FormError } from '@/features/auth-card'
import { ApiError } from '@/lib/api'
import { safeRedirect } from '@/lib/safe-redirect'
import { sessionQuery, useLogin } from '@/lib/session'

export const Route = createFileRoute('/login')({
  // De onde a pessoa veio antes de ser mandada para ca, para devolve-la ao
  // mesmo lugar depois de entrar.
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    // Quem ja tem sessao nao tem o que fazer na tela de login.
    try {
      await context.queryClient.ensureQueryData(sessionQuery())
      throw redirect({ href: safeRedirect(search.redirect) })
    } catch (error) {
      // Só o 401 significa "siga para o login": qualquer outra coisa aqui e o
      // proprio redirect subindo, e engoli-lo deixaria a pessoa presa na tela.
      if (!(error instanceof ApiError)) throw error
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const { redirect: destino } = Route.useSearch()
  const navigate = useNavigate()
  const login = useLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  return (
    <AuthCard
      title="Entrar"
      description="Acesse o pipeline com sua conta."
      footer={
        <>
          Nao tem conta?{' '}
          <Link to="/register" className="text-brand hover:underline">
            Cadastre-se
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) =>
          login.mutate(values, {
            onSuccess: () => navigate({ href: safeRedirect(destino) }),
          }),
        )}
      >
        <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="voce@empresa.com"
            {...register('email')}
          />
        </Field>

        <Field label="Senha" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
        </Field>

        <FormError message={login.error instanceof ApiError ? login.error.message : null} />

        <Button type="submit" disabled={login.isPending}>
          {login.isPending ? 'Entrando...' : 'Entrar'}
        </Button>

        <Link
          to="/forgot-password"
          className="text-center text-sm text-ink-muted hover:text-brand hover:underline"
        >
          Esqueci minha senha
        </Link>
      </form>
    </AuthCard>
  )
}
