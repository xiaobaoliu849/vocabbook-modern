import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',  // Use relative paths for Electron file:// protocol
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) {
            return 'vendor'
          }
          if (!id.includes('node_modules')) {
            return
          }
          const normalizedId = id.replace(/\\/g, '/')
          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/scheduler/')) {
            return 'react-vendor'
          }
          if (normalizedId.includes('/i18next') || normalizedId.includes('/react-i18next/')) {
            return 'i18n-vendor'
          }
          if (normalizedId.includes('/lucide-react/') || normalizedId.includes('/@radix-ui/')) {
            return 'ui-vendor'
          }
          if (
            normalizedId.includes('/mermaid/') ||
            normalizedId.includes('/@mermaid-js/') ||
            normalizedId.includes('/@braintree/sanitize-url/') ||
            normalizedId.includes('/@upsetjs/venn.js/') ||
            normalizedId.includes('/cytoscape') ||
            normalizedId.includes('/d3') ||
            normalizedId.includes('/dagre-d3-es/') ||
            normalizedId.includes('/dayjs/') ||
            normalizedId.includes('/dompurify/') ||
            normalizedId.includes('/katex/') ||
            normalizedId.includes('/khroma/') ||
            normalizedId.includes('/marked/') ||
            normalizedId.includes('/roughjs/') ||
            normalizedId.includes('/stylis/') ||
            normalizedId.includes('/ts-dedent/') ||
            normalizedId.includes('/uuid/')
          ) {
            return 'mermaid-vendor'
          }
          if (normalizedId.includes('/recharts/') || normalizedId.includes('/victory-vendor/')) {
            return 'chart-vendor'
          }
          if (normalizedId.includes('/react-markdown/')) {
            return 'markdown-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
