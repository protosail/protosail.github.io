import { defineConfig, type Plugin } from 'vite'

/**
 * Public assets in CSS are not rebased by Vite when their URLs start with `/`.
 * Rebase them in the emitted stylesheet so the same source works locally, on a
 * GitHub project page, and on a custom domain.
 */
function rebasePublicCss(): Plugin {
  let base = '/'

  return {
    name: 'rebase-public-css',
    configResolved(config) {
      base = config.base
    },
    generateBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'asset' || !output.fileName.endsWith('.css')) continue
        const source = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source)
        output.source = source.replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}`)
      }
    },
  }
}

export default defineConfig({
  plugins: [rebasePublicCss()],
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
