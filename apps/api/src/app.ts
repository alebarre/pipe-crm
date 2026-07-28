import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import { env, isDev } from './env.ts'
import { leadRoutes } from './routes/leads.ts'

export async function buildApp() {
  const app = Fastify({
    logger: { level: isDev ? 'info' : 'warn' },
  })

  // Faz o Fastify validar requests e serializar responses usando os schemas Zod
  // de @pipe/shared em vez de JSON Schema escrito na mao.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  /* ------------------------------------------------------------------ */
  /* Tratamento de erro                                                 */
  /*                                                                    */
  /* Precisa vir ANTES de registrar as rotas: cada `register` cria um    */
  /* contexto encapsulado que herda o handler vigente naquele momento.   */
  /* Registrando depois, os plugins ficariam com o handler padrao.       */
  /* ------------------------------------------------------------------ */

  app.setErrorHandler((error, request, reply) => {
    // Erro de validacao de entrada -> 400 com o caminho de cada campo,
    // no mesmo formato de apiErrorSchema que o front ja conhece.
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Requisicao invalida.',
        details: error.validation.map((issue) => {
          const zodIssue = (issue.params as { issue?: { path?: Array<string | number> } })?.issue
          return {
            path: zodIssue?.path?.join('.') || issue.instancePath.replace(/^\//, ''),
            message: issue.message ?? 'Valor invalido',
          }
        }),
      })
    }

    // A resposta nao bateu com o schema declarado: bug nosso, nao do cliente.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, url: request.url }, 'resposta fora do schema')
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'A resposta gerada nao corresponde ao contrato da API.',
      })
    }

    const failure = error as { statusCode?: number; name?: string; message?: string }
    const statusCode = failure.statusCode ?? 500
    if (statusCode >= 500) request.log.error({ err: error, url: request.url }, 'erro nao tratado')

    return reply.code(statusCode).send({
      statusCode,
      error: failure.name || 'Error',
      message:
        statusCode >= 500 && !isDev ? 'Erro interno.' : (failure.message ?? 'Erro inesperado.'),
    })
  })

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Rota ${request.method} ${request.url} nao existe.`,
    }),
  )

  /* ------------------------------------------------------------------ */
  /* Plugins e rotas                                                    */
  /* ------------------------------------------------------------------ */

  await app.register(sensible)
  await app.register(cors, {
    origin: [env.WEB_ORIGIN],
    credentials: true,
  })

  // Os mesmos schemas viram OpenAPI: /docs
  await app.register(swagger, {
    openapi: {
      info: { title: 'Pipe CRM API', version: '0.1.0' },
      servers: [{ url: `http://localhost:${env.API_PORT}` }],
    },
    transform: jsonSchemaTransform,
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))

  await app.register(leadRoutes, { prefix: '/api' })

  return app
}
