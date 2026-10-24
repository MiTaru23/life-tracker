import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works under any path (e.g. GitHub Pages /<repo>/).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'LIFE/OS',
        short_name: 'LIFE/OS',
        description: 'Journal, habits, sport, learning and hobbies with suggestions.',
        theme_color: '#050807',
        background_color: '#050807',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
