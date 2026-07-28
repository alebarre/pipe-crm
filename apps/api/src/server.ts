import { closeDb } from '@pipe/db'
import { buildApp } from './app.ts'
import { env } from './env.ts'

const app = await buildApp()

async function shutdown(signal: string) {
  app.log.info(`${signal} recebido, encerrando...`)
  try {
    await app.close()
    await closeDb()
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'falha no shutdown')
    process.exit(1)
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal))
}

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST })
  app.log.info(`docs em http://localhost:${env.API_PORT}/docs`)
} catch (error) {
  app.log.error({ err: error }, 'falha ao subir a API')
  process.exit(1)
}
