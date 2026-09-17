/**
 * Guard for `npm run dev` / `npm run build`: the site loads public/boat.opt.glb, which is
 * generated from boat.glb by `npm run model`. The processed file is committed, so this
 * only fires on a clone that has been tampered with — but a blank stage is a confusing
 * way to find that out.
 */
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../public/boat.opt.glb', import.meta.url))

if (!existsSync(file) || statSync(file).size < 1024) {
  console.error('public/boat.opt.glb is missing. Run "npm run model" to generate it from boat.glb.')
  process.exit(1)
}
