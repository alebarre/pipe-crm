import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema } from '@pipe/shared'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { AuthCard, FormError, FormSuccess } from '@/features/auth-card'
import { ApiError } from '@/lib/api'
import { useForgotPassword } from '@/lib/session'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const pedido = useForgotPassword()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  return (
    <AuthCard
      title="Recuperar senha"
      description="Enviamos um link para você definir uma nova senha."
      footer={
        <Link to="/login" search={{ redirect: undefined }} className="text-brand hover:underline">
          Voltar para o login
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => pedido.mutate(values))}
      >
        <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            placeholder="voce@empresa.com"
            {...register('email')}
          />
        </Field>

        {/*
          A mensagem de sucesso e a mesma para e-mail cadastrado ou nao — o
          servidor responde igual nos dois casos, de proposito, para esta tela
          nao virar um verificador de quem tem conta no sistema.
        */}
        <FormSuccess message={pedido.data?.message} />
        <FormError message={pedido.error instanceof ApiError ? pedido.error.message : null} />

        <Button type="submit" disabled={pedido.isPending}>
          {pedido.isPending ? 'Enviando...' : 'Enviar link'}
        </Button>
      </form>
    </AuthCard>
  )
}
