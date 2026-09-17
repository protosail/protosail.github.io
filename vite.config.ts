import { defineConfig } from 'vite'

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, open: false },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: ['index.html', 'news/index.html'],
    },
    // three.js core (~150 kB gzipped) stays in the entry because the hero needs it; the
    // viewer and its addons are split off by dynamic import. The default 500 kB warning
    // would fire on every build and mean nothing.
    chunkSizeWarningLimit: 900,
  },
})
