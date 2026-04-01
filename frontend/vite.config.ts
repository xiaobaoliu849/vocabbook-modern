import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // Use relative paths for Electron file:// protocol
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor'
          }
          if (id.includes('/i18next') || id.includes('/react-i18next/')) {
            return 'i18n-vendor'
          }
          if (id.includes('/lucide-react/') || id.includes('/@radix-ui/')) {
            return 'ui-vendor'
          }
          if (id.includes('/react-markdown/')) {
            return 'markdown-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
