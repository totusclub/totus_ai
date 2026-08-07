import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    watch: {
      // The backend lives in server/ and may write runtime files (caches,
      // debug dumps). The frontend watcher must NEVER react to that —
      // otherwise Vite full-reloads the page mid-response.
      ignored: ['**/server/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3010',
        ws: true,
      },
    },
  },
})
