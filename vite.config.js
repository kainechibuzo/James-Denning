import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // 'web' mode → absolute paths for Vercel (base: '/')
  // default mode → relative paths for Capacitor Android (base: './')
  base: mode === 'web' ? '/' : './',

  build: {
    outDir: 'dist',
    // Slightly larger chunk warning threshold — AppDemo.jsx is intentionally large
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        // Split Supabase into its own chunk for better caching
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },

  server: {
    port: 3000,
    open: true,
  },
}))
