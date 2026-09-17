/**
 * Prints the node/primitive/material structure of a GLB with world-space bounds.
 *
 * This is the tool to reach for when the boat gets re-exported from Fusion and
 * process-model.mjs starts complaining, or when you need to know which primitive of a
 * multi-material part carries which material before writing a material override.
 *
 *   npm run inspect                       # the processed copy
 *   npm run inspect -- boat.glb           # the pristine source
 *   npm run inspect -- boat.glb solarMain # just these nodes
 */

import { fileURLToPath } from 'node:url'
import { join, isAbsolute } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const args = process.argv.slice(2)
const file = args[0] && !args[0].startsWith('-') ? args.shift() : 'public/boat.opt.glb'
const want = new Set(args)

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
const doc = await io.read(isAbsolute(file) ? file : join(ROOT, file))
const root = doc.getRoot()

const applyMat4 = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]
const fmt = (v) => v.map((x) => x.toFixed(4).padStart(9)).join(' ')

function worldBounds(matrix, prim) {
  const pos = prim.getAttribute('POSITION')
  const min = pos.getMinNormalized([0, 0, 0])
  const max = pos.getMaxNormalized([0, 0, 0])
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < 8; i++) {
    const corner = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]
    const w = applyMat4(matrix, corner)
    for (let k = 0; k < 3; k++) {
      if (w[k] < lo[k]) lo[k] = w[k]
      if (w[k] > hi[k]) hi[k] = w[k]
    }
  }
  return { lo, hi }
}

console.log(`\n  ${file}\n`)
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const name = node.getName()
  if (want.size && !want.has(name)) continue
  console.log(`  ${name}`)
  const matrix = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    const { lo, hi } = worldBounds(matrix, prim)
    const indices = prim.getIndices()
    const tris = (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3
    const attrs = prim.listSemantics().join('/')
    console.log(
      `    ${(prim.getMaterial()?.getName() ?? '<none>').padEnd(30)}` +
        ` ${String(tris).padStart(6)} tris  ${attrs.padEnd(16)}` +
        `  lo=[${fmt(lo)}]  hi=[${fmt(hi)}]`,
    )
  }
}
console.log('')
