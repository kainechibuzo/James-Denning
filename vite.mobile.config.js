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
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          lucide: ['lucide-react'],
        },
      },
    },
  },
  server: {
    port: 3001,
    open: '/mobile.html',
  },
})
