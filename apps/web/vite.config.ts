import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // Gera src/routeTree.gen.ts a partir de src/routes/*. Precisa vir antes do react().
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Em dev o front chama /api no proprio origin e o Vite repassa para a API.
    // Nada de CORS nem de cookie cross-site durante o desenvolvimento.
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: true },
    },
  },
})
