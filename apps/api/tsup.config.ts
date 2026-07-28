import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Pacotes do workspace exportam .ts cru, entao precisam entrar no bundle.
  // O resto das dependencias tambem entra: o resultado e um artefato unico,
  // que roda em container sem node_modules nenhum.
  noExternal: [/^@pipe\//],
  // Excecao: o PGlite carrega arquivos .wasm/.data relativos ao proprio
  // pacote, entao embuti-lo quebra o bundle. Fica externo e so e carregado
  // no modo de desenvolvimento sem Docker.
  external: ['@electric-sql/pglite'],
})
