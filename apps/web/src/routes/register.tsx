import { zodResolver } from '@hookform/resolvers/zod'
import { registerFormSchema } from '@pipe/shared'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthCard, FormError } from '@/features/auth-card'
import { ApiError } from '@/lib/api'
import { useRegister } from '@/lib/session'

export const Route = createFileRoute('/register')({
  component: RegisterPage,
})

function RegisterPage() {
  const navigate = useNavigate()
  const criarConta = useRegister()

  const {
    register: campo,
    handleSubmit,
    formState: { errors },
  } = useForm({
    // `registerFormSchema` = o schema da API + a confirmacao de senha, que e
    // assunto do formulario. O campo repetido nao vai para a rede.
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  return (
    <AuthCard
      title="Criar conta"
      description="Toda conta nova entra como usuario comum."
      footer={
        <>
          Ja tem conta?{' '}
          <Link to="/login" search={{ redirect: undefined }} className="text-brand hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        // `confirmPassword` fica de fora: e validacao de tela, nao dado da API.
        onSubmit={handleSubmit((values) =>
          criarConta.mutate(
            { name: values.name, email: values.email, password: values.password },
            {
              // O cadastro ja abre a sessao: nao ha por que pedir o login que
              // a pessoa acabou de digitar.
              onSuccess: () => navigate({ to: '/leads' }),
            },
          ),
        )}
      >
        <Field label="Nome" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoFocus autoComplete="name" {...campo('name')} />
        </Field>

        <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com"
            {...campo('email')}
          />
        </Field>

        <Field
          label="Senha"
          htmlFor="password"
          error={errors.password?.message}
          hint="Ao menos 8 caracteres"
        >
          <Input id="password" type="password" autoComplete="new-password" {...campo('password')} />
        </Field>

        <Field
          label="Confirme a senha"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            {...campo('confirmPassword')}
          />
        </Field>

        <FormError
          message={criarConta.error instanceof ApiError ? criarConta.error.message : null}
        />

        <Button type="submit" disabled={criarConta.isPending}>
          {criarConta.isPending ? 'Criando...' : 'Criar conta'}
        </Button>
      </form>
    </AuthCard>
  )
}
