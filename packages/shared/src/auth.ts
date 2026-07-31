import { z } from 'zod'

/**
 * Fonte unica de verdade do dominio "autenticacao".
 *
 * Consumido por:
 *  - apps/api    -> validacao de request + serializacao de response (Fastify)
 *  - apps/web    -> validacao de formulario (React Hook Form) e tipos do client
 *  - packages/db -> confere com o enum do Postgres via USER_ROLES
 *
 * Os tokens NAO aparecem em nenhum schema de resposta: eles viajam em cookies
 * httpOnly, que o JavaScript do front nao le. O corpo devolve so o usuario.
 */

export const USER_ROLES = ['admin', 'user'] as const

export const userRoleSchema = z.enum(USER_ROLES)
export type UserRole = z.infer<typeof userRoleSchema>

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  user: 'Usuario',
}

/**
 * Permissoes do produto, derivadas do papel.
 *
 * Existe aqui, e nao espalhado em `role === 'admin'` pelos componentes, para
 * que o dia em que surgir um terceiro papel a mudanca seja neste arquivo.
 * A checagem que vale e sempre a do servidor; no front isto e so UX.
 */
export function canManageLeads(role: UserRole | undefined): boolean {
  return role === 'admin'
}

/** Ler o pipeline e registrar interacao valem para qualquer usuario logado. */
export function canLogInteraction(role: UserRole | undefined): boolean {
  return role !== undefined
}

/* -------------------------------------------------------------------------- */
/* Entidade (o que a API devolve)                                             */
/* -------------------------------------------------------------------------- */

export const userSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: userRoleSchema,
  createdAt: z.iso.datetime(),
})

export type User = z.infer<typeof userSchema>

/** Resposta de /auth/login, /auth/register, /auth/refresh e /auth/me. */
export const sessionSchema = z.object({
  user: userSchema,
})

export type Session = z.infer<typeof sessionSchema>

/** Resposta de operacoes que so confirmam ("um e-mail foi enviado"). */
export const messageSchema = z.object({
  message: z.string(),
})

/* -------------------------------------------------------------------------- */
/* Entrada (o que a API aceita e o que o formulario valida)                    */
/* -------------------------------------------------------------------------- */

const emailField = z.string().trim().toLowerCase().pipe(z.email('E-mail invalido'))

/**
 * O limite superior nao e decoracao: sem ele, um POST com uma senha de alguns
 * megabytes vira trabalho de hash do lado do servidor — negacao de servico de
 * graca. 200 caracteres cobrem qualquer passphrase real.
 */
const passwordField = z
  .string()
  .min(8, 'A senha precisa de ao menos 8 caracteres')
  .max(200, 'Maximo de 200 caracteres')

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe ao menos 2 caracteres')
    .max(120, 'Maximo de 120 caracteres'),
  email: emailField,
  password: passwordField,
})

export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Informe a senha'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token ausente'),
  password: passwordField,
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/* -------------------------------------------------------------------------- */
/* Variantes de formulario                                                    */
/*                                                                            */
/* A confirmacao de senha e assunto do formulario, nao da API: mandar o campo  */
/* repetido pela rede nao acrescenta nada. Por isso os schemas com `confirm`   */
/* vivem separados e o handler do front envia o objeto sem ele.               */
/* -------------------------------------------------------------------------- */

const confirmPasswordField = { confirmPassword: z.string() }

const passwordsMatch = (data: { password: string; confirmPassword: string }) =>
  data.password === data.confirmPassword

const mismatch = { path: ['confirmPassword'], message: 'As senhas nao conferem' }

/**
 * Os dois schemas repetem o `.extend().refine()` em vez de sairem de uma
 * funcao generica: com um `<T extends z.ZodObject>` no meio, o TypeScript
 * perde o formato do objeto e devolve `{ [x: string]: unknown }` para o
 * formulario — o que tira a tipagem justamente de quem mais se beneficia dela.
 */
export const registerFormSchema = registerSchema
  .extend(confirmPasswordField)
  .refine(passwordsMatch, mismatch)

export type RegisterFormInput = z.infer<typeof registerFormSchema>

export const resetPasswordFormSchema = resetPasswordSchema
  .extend(confirmPasswordField)
  .refine(passwordsMatch, mismatch)

export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>
