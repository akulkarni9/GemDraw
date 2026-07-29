import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET ?? 'http://localhost:8008',
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      include: ['lodash.throttle', 'lodash.debounce', 'lodash.get'],
    },
  }
})
