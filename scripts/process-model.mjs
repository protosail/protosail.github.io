/**
 * boat.glb  ->  public/boat.opt.glb
 *
 * Reads the pristine Fusion export read-only and writes an optimised, semantically
 * named copy. Two contracts this script must never break:
 *
 *   1. It is POSE-PRESERVING. Every joint axis in src/config/joints.ts is a world
 *      coordinate measured in the source file, so no centering, no re-orienting.
 *      The verify pass at the bottom re-opens the output and enforces this.
 *
 *   2. Every part listed in RULES gets a stable id as its node name, and every mesh
 *      node in the file is claimed by exactly one rule. A future Fusion re-export
 *      that renames or splits something fails loudly here rather than silently
 *      producing a viewer with a missing rudder.
 *
 * Run: npm run model
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, flatten, prune, weld, quantize } from '@gltf-transform/functions'

// The project path contains a space; new URL()/fileURLToPath is the only safe way here.
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SRC = join(ROOT, 'boat.glb')
const OUT_DIR = join(ROOT, 'public')
const OUT = join(OUT_DIR, 'boat.opt.glb')

/** Max allowed drift of any part's world AABB, in metres. Quantization costs ~0.03 mm. */
const POSE_TOLERANCE = 0.001

// ---------------------------------------------------------------------------
// Part map
// ---------------------------------------------------------------------------

/**
 * Fusion names every mesh-bearing node `BodyN.xxx`; the meaningful names live on the
 * group nodes above them — exactly the nodes flatten() + prune() delete. So we resolve
 * and apply ids BEFORE flattening.
 *
 * `group` matches the normalised name of a mesh node's nearest non-`Body*` ancestor.
 * Where one group holds several parts, `where` narrows by measured world position, and
 * `count` asserts how many nodes the rule must claim.
 */
const RULES = [
  { id: 'hull', group: 'hull' },
  { id: 'hallSensor', group: 'hall_sensor' },

  // Wing assembly — all of these rotate together about the mast axis.
  { id: 'wing', group: 'sail' },
  { id: 'wingFrame', group: 'sail_skeleton' },
  { id: 'counterweightUpper', group: 'sail_weight', where: (b) => b.center[1] > 0.6 },
  { id: 'counterweightLower', group: 'sail_weight', where: (b) => b.center[1] <= 0.6 },
  { id: 'tailVane', group: 'tail' },

  { id: 'rudder', group: 'rudder' },

  // Twins, told apart by where they sit along the hull (+X is aft).
  { id: 'hatchMain', group: 'hatch', where: (b) => b.center[0] < 0.5 },
  { id: 'hatchAft', group: 'hatch', where: (b) => b.center[0] >= 0.5 },
  { id: 'housingFwd', group: 'housing', where: (b) => b.center[0] < 0.35 },
  { id: 'housingAft', group: 'housing', where: (b) => b.center[0] >= 0.35 },

  { id: 'solarBow', group: 'solar3' },
  { id: 'solarAft', group: 'solar2' },
  // solar1 is a base panel plus eight discrete 125 mm cells, all siblings.
  { id: 'solarMain', group: 'solar1', where: (_b, n) => /^body1\b/.test(norm(n)) },
  {
    id: (i) => `solarCell${i + 1}`,
    group: 'solar1',
    where: (_b, n) => /^body[2-9]\b/.test(norm(n)),
    count: 8,
  },
]

/** lowercase; drop Fusion's `:N` instance, `.001` copy and ` (1)` occurrence suffixes. */
function norm(name) {
  return String(name)
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.\d+$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim()
}

// ---------------------------------------------------------------------------
// Small matrix / bounds helpers (column-major mat4 as number[16])
// ---------------------------------------------------------------------------

function applyMat4(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

/** World-space AABB of a node's mesh, from POSITION accessor min/max. */
function worldBounds(node) {
  const mesh = node.getMesh()
  if (!mesh) return null
  const m = node.getWorldMatrix()
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const min = pos.getMinNormalized([0, 0, 0])
    const max = pos.getMaxNormalized([0, 0, 0])
    for (let i = 0; i < 8; i++) {
      const corner = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]
      const w = applyMat4(m, corner)
      for (let k = 0; k < 3; k++) {
        if (w[k] < lo[k]) lo[k] = w[k]
        if (w[k] > hi[k]) hi[k] = w[k]
      }
    }
  }
  return { lo, hi, center: [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) }
}

/** Walk up to the nearest ancestor whose name isn't another `BodyN` placeholder. */
function semanticGroup(node) {
  for (let n = node.getParentNode(); n; n = n.getParentNode()) {
    const name = norm(n.getName())
    if (name && !/^body\d/.test(name)) return name
  }
  return null
}

function fail(message, detail) {
  console.error(`\n  x  ${message}`)
  if (detail) console.error(detail)
  console.error('')
  process.exit(1)
}

const fmt = (v) => v.map((x) => x.toFixed(4).padStart(9)).join(' ')

// ---------------------------------------------------------------------------
// 1. Load (read-only) and resolve the part map
// ---------------------------------------------------------------------------

if (!existsSync(SRC)) fail(`Source model not found at ${SRC}`)

const srcBytes = readFileSync(SRC)
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS)
const doc = await io.readBinary(new Uint8Array(srcBytes))
const root = doc.getRoot()

console.log(`\n  microtransat / process-model`)
console.log(`  source  ${(srcBytes.length / 1024).toFixed(0)} KB  ` +
  `${root.listNodes().length} nodes  ${root.listMeshes().length} meshes  ` +
  `${root.listMaterials().length} materials`)

// dedup first, so identical accessors collapse before we touch anything.
// keepUniqueNames is not optional: `Clear`, `Glossy - Black`, `Steel - Polished` and
// `Black` are byte-identical apart from their names, and the runtime tells housings
// from solar cells from the tail by exactly those names.
await doc.transform(dedup({ keepUniqueNames: true }))

const meshNodes = root.listNodes().filter((n) => n.getMesh())
const measured = new Map(meshNodes.map((n) => [n, worldBounds(n)]))

const claimed = new Map() // node -> id
const report = []

for (const rule of RULES) {
  const candidates = meshNodes.filter((n) => {
    if (claimed.has(n)) return false
    if (semanticGroup(n) !== rule.group) return false
    return rule.where ? rule.where(measured.get(n), n.getName()) : true
  })

  const expected = rule.count ?? 1
  if (candidates.length !== expected) {
    fail(
      `Part rule "${typeof rule.id === 'function' ? rule.id(0) + '…' : rule.id}" ` +
        `matched ${candidates.length} nodes, expected ${expected}.`,
      `     group: ${rule.group}\n` +
        `     Fusion export probably renamed or re-split this part. Mesh nodes present:\n` +
        meshNodes
          .map((n) => `       ${n.getName().padEnd(14)} group=${semanticGroup(n)}` +
            `  center=[${fmt(measured.get(n).center)}]`)
          .join('\n'),
    )
  }

  // Deterministic ordering for multi-node rules: fore-to-aft, then across.
  candidates.sort((a, b) => {
    const ca = measured.get(a).center
    const cb = measured.get(b).center
    return ca[0] - cb[0] || ca[2] - cb[2]
  })

  candidates.forEach((node, i) => {
    const id = typeof rule.id === 'function' ? rule.id(i) : rule.id
    claimed.set(node, id)
    report.push({ id, from: node.getName(), bounds: measured.get(node) })
  })
}

const orphans = meshNodes.filter((n) => !claimed.has(n))
if (orphans.length) {
  fail(
    `${orphans.length} mesh node(s) unclaimed by any part rule.`,
    orphans
      .map((n) => `       ${n.getName().padEnd(14)} group=${semanticGroup(n)}` +
        `  center=[${fmt(measured.get(n).center)}]`)
      .join('\n'),
  )
}

// Apply the ids. The Mesh gets the same name so debugging tools agree with the node.
for (const [node, id] of claimed) {
  node.setName(id)
  node.getMesh().setName(id)
}

// Bounds we must still have at the end, keyed by the id we just assigned.
const before = new Map([...claimed].map(([node, id]) => [id, measured.get(node)]))

// ---------------------------------------------------------------------------
// 2. Optimise
// ---------------------------------------------------------------------------

await doc.transform(
  // Every part becomes a direct child of the scene with its world TRS baked in —
  // which is what lets the runtime rig re-parent parts into pivots with attach().
  flatten(),
  prune({ keepAttributes: false, keepLeaves: false }),
  weld(),
  // 16-bit positions and normals cost the same bytes as 14/12 (both Int16) and remove
  // any risk of banding in the clearcoat reflections on the big smooth hull.
  quantize({ quantizePosition: 16, quantizeNormal: 16 }),
  // quantize's cleanup can leave newly-orphaned materials behind.
  prune({ propertyTypes: [PropertyType.MATERIAL, PropertyType.ACCESSOR], keepLeaves: true }),
)

mkdirSync(OUT_DIR, { recursive: true })
const outBytes = await io.writeBinary(doc)
writeFileSync(OUT, outBytes)

// ---------------------------------------------------------------------------
// 3. Verify — re-open what we actually wrote
// ---------------------------------------------------------------------------

const check = await io.readBinary(outBytes)
const checkRoot = check.getRoot()
const scene = checkRoot.getDefaultScene() ?? checkRoot.listScenes()[0]
const topLevel = new Set(scene.listChildren())

let worst = 0
let worstId = ''
const problems = []

for (const [id, srcB] of before) {
  const node = checkRoot.listNodes().find((n) => n.getName() === id)
  if (!node) {
    problems.push(`${id}: missing from the output file`)
    continue
  }
  if (!topLevel.has(node)) {
    problems.push(`${id}: not a direct child of the scene (the rig assumes identity parents)`)
  }
  const outB = worldBounds(node)
  const drift = Math.max(
    ...[0, 1, 2].map((k) => Math.max(Math.abs(outB.lo[k] - srcB.lo[k]), Math.abs(outB.hi[k] - srcB.hi[k]))),
  )
  if (drift > worst) {
    worst = drift
    worstId = id
  }
  if (drift > POSE_TOLERANCE) {
    problems.push(
      `${id}: moved ${(drift * 1000).toFixed(2)} mm\n` +
        `         was lo=[${fmt(srcB.lo)}] hi=[${fmt(srcB.hi)}]\n` +
        `         now lo=[${fmt(outB.lo)}] hi=[${fmt(outB.hi)}]`,
    )
  }
}

// The source must be untouched, always.
const after = readFileSync(SRC)
if (after.length !== srcBytes.length || !after.equals(srcBytes)) {
  fail('boat.glb changed during processing. That should be impossible — investigate before continuing.')
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

console.log(`\n  part map (${report.length} parts)`)
for (const { id, from, bounds } of report) {
  console.log(`    ${id.padEnd(19)} <- ${from.padEnd(12)}  lo=[${fmt(bounds.lo)}]  hi=[${fmt(bounds.hi)}]`)
}

console.log(`\n  materials  ${checkRoot.listMaterials().map((m) => m.getName()).join(', ')}`)
console.log(`  output     ${(outBytes.length / 1024).toFixed(0)} KB  ` +
  `(${((1 - outBytes.length / srcBytes.length) * 100).toFixed(0)}% smaller)  ` +
  `${checkRoot.listNodes().length} nodes`)
console.log(`  pose       max drift ${(worst * 1000).toFixed(3)} mm (${worstId})`)
console.log(`  source     unchanged, ${srcBytes.length} bytes`)

if (problems.length) fail(`Verification failed:`, problems.map((p) => `       ${p}`).join('\n'))

console.log(`\n  ok  ->  public/boat.opt.glb\n`)
