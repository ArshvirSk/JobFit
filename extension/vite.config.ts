import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import manifest from './manifest.json' with { type: 'json' }
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL('../web/src', import.meta.url)),
      "next/navigation": fileURLToPath(new URL('./src/lib/next-navigation-mock.ts', import.meta.url))
    },
    dedupe: ['react', 'react-dom']
  },
})
