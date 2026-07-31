import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Banco descartavel, separado do de desenvolvimento. Definido aqui e nao
    // no .env porque o dotenv nao sobrescreve variaveis ja presentes.
    env: {
      DATABASE_URL: 'pglite://.pgdata-test',
      NODE_ENV: 'test',
      // Vazio de proposito: sem credencial o mailer nao abre conexao SMTP.
      // Nenhum teste pode depender de rede — nem mandar e-mail de verdade
      // para o endereco de quem estiver com o .env de producao na maquina.
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    },
    // O PGlite abre o diretorio de dados de forma exclusiva.
    fileParallelism: false,
  },
})
