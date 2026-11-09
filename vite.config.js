import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Web deployments use root-relative asset URLs; Capacitor uses bundled relative URLs.
  base: mode === 'web' ? '/' : './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Keep framework, data access and spreadsheet code independently cacheable.
        // AppDemo and auth/landing routes are split automatically by React.lazy().
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor'
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
          if (/\/node_modules\/(xlsx|xlsx-js-style)\//.test(id)) return 'spreadsheet-vendor'
        },
      },
    },
  },
  server: { port: 3000, open: true },
}))
