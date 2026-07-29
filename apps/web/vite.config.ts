import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [
    // Gera src/routeTree.gen.ts a partir de src/routes/*. Precisa vir antes do react().
    tanstackRouter({
      target: 'react',
      // Só no build. Em dev, o autoCodeSplitting reescreve cada rota em modulos
      // virtuais (`arquivo.tsx?tsr-split=component`), o que polui a arvore de
      // arquivos do DevTools e faz breakpoints no arquivo original nao pegarem.
      // O code splitting importa para o bundle de producao, nao para o dev.
      autoCodeSplitting: command === 'build',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    // Permite inspecionar as regras do Tailwind ate o arquivo de origem.
    devSourcemap: true,
  },
  build: {
    // Sourcemaps tambem no build, para depurar o app publicado.
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Em dev o front chama /api no proprio origin e o Vite repassa para a API.
    // Nada de CORS nem de cookie cross-site durante o desenvolvimento.
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: true },
    },
  },
}))
