import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Banco descartavel, separado do de desenvolvimento. Definido aqui e nao
    // no .env porque o dotenv nao sobrescreve variaveis ja presentes.
    env: {
      DATABASE_URL: 'pglite://.pgdata-test',
      NODE_ENV: 'test',
    },
    // O PGlite abre o diretorio de dados de forma exclusiva.
    fileParallelism: false,
  },
})
