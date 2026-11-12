import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-mobile',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: 'mobile.html',
      output: {
        // Vite 8 (rolldown) requires manualChunks to be a FUNCTION; the object
        // form silently fails the build with "manualChunks is not a function".
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return
          if (id.includes('/node_modules/@supabase/')) return 'supabase'
          if (id.includes('/node_modules/lucide-react/')) return 'lucide'
        },
      },
    },
  },
  server: {
    port: 3001,
    open: '/mobile.html',
  },
})
