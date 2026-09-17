/**
 * Copies the two self-hosted font files (and their licences) out of node_modules into
 * public/fonts, where index.html preloads them and src/styles/fonts.css declares them.
 *
 * The exact woff2 filenames are read from the package CSS rather than hard-coded, so a
 * fontsource version bump that renames a file cannot silently break the site.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, 'public', 'fonts')
mkdirSync(out, { recursive: true })

const FONTS = [
  // Archivo: the `wdth` entry carries both the weight (100–900) and width (62–125) axes.
  { pkg: '@fontsource-variable/archivo', css: 'wdth.css', out: 'archivo-latin-wdth-normal.woff2' },
  { pkg: '@fontsource/fragment-mono', css: '400.css', out: 'fragment-mono-latin-400-normal.woff2' },
]

const licences = []

for (const font of FONTS) {
  const dir = join(root, 'node_modules', font.pkg)
  const css = readFileSync(join(dir, font.css), 'utf8')
  // Each @font-face block is preceded by a comment such as `/* archivo-latin-wdth-normal */`.
  const blocks = css.split('@font-face').slice(1)
  const latin = blocks.find((b) => /-latin-/.test(b) && !/-latin-ext-/.test(b))
  if (!latin) throw new Error(`${font.pkg}/${font.css}: no latin @font-face block found`)
  const match = latin.match(/url\((?:'|")?\.\/files\/([^)'"]+\.woff2)(?:'|")?\)/)
  if (!match) throw new Error(`${font.pkg}/${font.css}: no woff2 url in the latin block`)
  const src = join(dir, 'files', match[1])
  const dst = join(out, font.out)
  copyFileSync(src, dst)
  console.log(`${font.out.padEnd(40)} ${(statSync(dst).size / 1024).toFixed(1)} kB  (from ${match[1]})`)

  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  let licence = ''
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try {
      licence = readFileSync(join(dir, name), 'utf8')
      break
    } catch {
      /* try the next name */
    }
  }
  licences.push(`${pkg.name} ${pkg.version} — ${pkg.license ?? 'licence unknown'}\n\n${licence.trim()}\n`)
}

writeFileSync(join(out, 'LICENSES.txt'), licences.join('\n\n' + '-'.repeat(72) + '\n\n'))
console.log('LICENSES.txt written')
