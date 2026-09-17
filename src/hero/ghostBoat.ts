/**
 * The boat in the hero: the same geometry the viewer uses, drawn as a fresnel ghost
 * riding the sea. It is a placeholder for the real hull, so it is deliberately not a
 * product render — a translucent, drawn-through silhouette that reads as "prototype".
 *
 * Geometry is shared by reference with the viewer (each renderer uploads its own GPU
 * copy); the rest-pose matrices come from the snapshot fetchModel() takes at parse time,
 * so nothing here depends on what the viewer's rig does to the scene later.
 */

import { Group, Matrix4, Mesh, Vector3 } from 'three'
import { JOINTS } from '../config/joints.js'
import { WING_ASSEMBLY } from '../config/parts.js'
import { createGhostMaterial } from '../viewer/materials.js'
import { fetchModel } from '../viewer/model.js'
import type { Ocean } from './ocean.js'
import { sampleHeight } from './waves.js'

const DEG = Math.PI / 180

/** Where the boat sits in the ocean's world: right of centre, a little way out. */
const DEPTH = 9.5
/** Heading about +Y. The model's bow points along −X, so this turns it toward the viewer's right. */
const HEADING = 35 * DEG
/** The wing is presented off the centreline so its section reads; the tab follows it. */
const WING_ANGLE = -62 * DEG
// A slightly stronger shell keeps the hull and wing legible through the sea fog.
const COLOUR = 0xe3f941
const OPACITY = 0.68
/** How quickly the hull follows the water: a slow, heavy response. */
const FOLLOW = 0.3

export async function mountGhostBoat(ocean: Ocean, copy: HTMLElement): Promise<void> {
  const { rest } = await fetchModel()
  if (ocean.disposed) return

  // The sea occludes the keel and troughs: the silhouette belongs in the water.
  const material = createGhostMaterial(COLOUR, OPACITY, { depthTest: true, body: .2 })
  // Share the sea's screen-space lamp so the cursor lights the prototype and
  // water as one scene rather than as two overlapping effects.
  material.uniforms.uPointer = ocean.uniforms.uPointer
  material.uniforms.uPointerStrength = ocean.uniforms.uPointerStrength
  material.uniforms.uResolution = ocean.uniforms.uResolution

  const boat = new Group()
  boat.name = 'hero-boat'
  boat.rotation.order = 'YXZ'

  // The wing assembly hangs off a pivot at the measured mast axis so it can be turned.
  const wingPivot = new Group()
  wingPivot.position.set(JOINTS.wing.axis[0], 0, JOINTS.wing.axis[1])
  wingPivot.rotation.y = WING_ANGLE
  boat.add(wingPivot)
  const toPivot = new Matrix4().makeTranslation(-JOINTS.wing.axis[0], 0, -JOINTS.wing.axis[1])
  const wingParts = new Set<string>([...WING_ASSEMBLY, 'tailVane'])

  for (const { part, geometry, matrixWorld } of rest) {
    const mesh = new Mesh(geometry, material)
    mesh.matrixAutoUpdate = false
    mesh.frustumCulled = false
    if (wingParts.has(part)) {
      mesh.matrix.copy(toPivot).multiply(matrixWorld)
      wingPivot.add(mesh)
    } else {
      mesh.matrix.copy(matrixWorld)
      boat.add(mesh)
    }
  }

  const corners: Vector3[] = []
  boat.updateMatrixWorld(true)
  // Keep bounds per part: one large box includes empty space around the wing
  // and hull, which would shift the apparent center in this oblique view.
  boat.traverse(object => {
    if (!(object instanceof Mesh)) return
    object.geometry.computeBoundingBox()
    const bounds = object.geometry.boundingBox!
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          corners.push(new Vector3(x, y, z).applyMatrix4(object.matrixWorld))
        }
      }
    }
  })
  boat.rotation.y = HEADING
  const projected = new Vector3()
  let targetX = 0
  let mobileScale = 1.2
  let mobileDepth = 5.7
  let mobileX = 0
  let mobileLandscapeTargetX = .55
  let fitMobile = true
  let sceneWidth = 1, sceneHeight = 1, viewportWidth = 1
  let viewportLeft = 0, viewportTop = 0, viewportRight = 1, viewportBottom = 1
  let copyBottom = 0, copyRight = 0
  const canvas = ocean.renderer.domElement
  const measure = () => {
    const sceneRect = canvas.getBoundingClientRect()
    sceneWidth = sceneRect.width
    sceneHeight = sceneRect.height
    const hero = copy.closest<HTMLElement>('.hero')!
    const heroRect = hero.getBoundingClientRect()
    viewportWidth = hero.clientWidth
    viewportLeft = heroRect.left - sceneRect.left
    viewportTop = heroRect.top - sceneRect.top
    viewportRight = viewportLeft + hero.clientWidth
    viewportBottom = viewportTop + hero.clientHeight
    copyBottom = copy.getBoundingClientRect().bottom - sceneRect.top + 20
    fitMobile = true
    const textRight = Math.max(...Array.from(copy.children, child => child.getBoundingClientRect().right))
    copyRight = textRight - sceneRect.left
    const landscapeLeft = Math.max(copyRight + 20, viewportLeft + viewportWidth * .5)
    mobileLandscapeTargetX = ((landscapeLeft + viewportRight - 18) / 2) / sceneWidth * 2 - 1
    const midpoint = (textRight + copy.getBoundingClientRect().right) / 2
    // Include the canvas's CSS overscan when converting the free space to NDC.
    targetX = (midpoint - sceneRect.left) / sceneRect.width * 2 - 1
  }
  let layoutFrame = 0
  const layout = new ResizeObserver(() => {
    cancelAnimationFrame(layoutFrame)
    layoutFrame = requestAnimationFrame(() => {
      measure()
      if (!ocean.running) ocean.renderOnce()
    })
  })
  layout.observe(copy)
  layout.observe(canvas)
  for (const child of copy.children) layout.observe(child)
  measure()

  ocean.scene.add(boat)
  ocean.onDispose = () => { cancelAnimationFrame(layoutFrame); layout.disconnect(); ocean.scene.remove(boat); material.dispose() }

  // Ride the sea: sample the surface at bow, stern and abeam, in world coordinates.
  const cosH = Math.cos(HEADING)
  const sinH = Math.sin(HEADING)
  const at = (lx: number, lz: number, t: number) =>
    sampleHeight(boat.position.x + (lx * cosH + lz * sinH) * boat.scale.x,
      boat.position.z + (-lx * sinH + lz * cosH) * boat.scale.x, t)

  let heave = 0
  let pitch = 0
  let roll = 0
  let initialized = false
  let previousAspect = 0

  ocean.onFrame = (dt, t) => {
    const portrait = ocean.camera.aspect < 1
    const mobile = viewportWidth < 860
    const depth = mobile ? (portrait ? mobileDepth : 9.5) : DEPTH
    // Nearly twice the previous desktop size; fit narrower landscape viewports
    // proportionally so the hull still clears the right edge.
    const scale = mobile
      ? (portrait ? mobileScale : 1.55)
      : Math.min(3.0, 2.85 * ocean.camera.aspect / 1.6)
    boat.scale.setScalar(scale)
    boat.position.z = -depth
    const halfWidth = depth * Math.tan(ocean.camera.fov * DEG / 2) * ocean.camera.aspect
    // Keep the existing stacked composition on mobile. On desktop, center the
    // projected silhouette in the space between the copy and its container edge.
    boat.position.x = mobile
      ? (portrait ? mobileX : halfWidth * mobileLandscapeTargetX)
      : halfWidth * targetX
    if (!portrait) {
      const horizontalTarget = mobile ? mobileLandscapeTargetX : targetX
      ocean.camera.updateMatrixWorld()
      for (let pass = 0; pass < 2; pass++) {
        boat.updateMatrix()
        let left = Infinity, right = -Infinity
        for (const corner of corners) {
          projected.copy(corner).applyMatrix4(boat.matrix).project(ocean.camera)
          left = Math.min(left, projected.x)
          right = Math.max(right, projected.x)
        }
        boat.position.x += (horizontalTarget - (left + right) / 2) * halfWidth
      }
    }
    const bow = at(-1.0, 0, t)
    const stern = at(1.0, 0, t)
    const port = at(0, -0.6, t)
    const starboard = at(0, 0.6, t)
    const centre = at(0, 0, t)

    const k = !initialized || previousAspect !== ocean.camera.aspect ? 1 : dt > 0 ? 1 - Math.exp(-dt / FOLLOW) : 0
    initialized = true
    previousAspect = ocean.camera.aspect
    heave += (centre - heave) * k
    pitch += (Math.atan2(stern - bow, 2.0 * boat.scale.x) - pitch) * k
    roll += (-Math.atan2(starboard - port, 1.2 * boat.scale.x) - roll) * k

    // Keep the hull comfortably inside the first viewport instead of letting its
    // waterline composition sag against the bottom edge on shorter screens.
    boat.position.y = heave + (mobile ? (portrait ? .3 : .9) : .35)
    boat.rotation.z = pitch
    boat.rotation.x = roll
    if (mobile && portrait && fitMobile) {
      // Fit the actual silhouette into a phone-specific safe region. Portrait
      // stacks it below the copy; landscape uses the open right side. A small
      // inset absorbs normal wave motion without making the boat feel undersized.
      ocean.camera.updateMatrixWorld()
      let bestSize = 0
      const region = { left: viewportLeft + 18, right: viewportRight - 18, top: copyBottom + 8, bottom: viewportBottom - 56 }
      const targetNdcX = ((region.left + region.right) / 2) / sceneWidth * 2 - 1
      // Moving along the sea, rather than lifting the hull, gives short screens
      // the same complete vessel while preserving its contact with the waves.
      const maxScale = 1.35
      for (let distance = 4; distance <= 14; distance += .25) {
        boat.position.z = -distance
        const candidateHalfWidth = distance * Math.tan(ocean.camera.fov * DEG / 2) * ocean.camera.aspect
        let low = 0, high = maxScale
        for (let pass = 0; pass < 8; pass++) {
          const candidate = (low + high) / 2
          boat.scale.setScalar(candidate)
          boat.position.x = 0
          boat.updateMatrix()
          let minX = Infinity, maxX = -Infinity
          for (const corner of corners) {
            projected.copy(corner).applyMatrix4(boat.matrix).project(ocean.camera)
            minX = Math.min(minX, projected.x)
            maxX = Math.max(maxX, projected.x)
          }
          boat.position.x += (targetNdcX - (minX + maxX) / 2) * candidateHalfWidth
          boat.updateMatrix()
          const fits = corners.every(corner => {
            projected.copy(corner).applyMatrix4(boat.matrix).project(ocean.camera)
            const x = (projected.x + 1) * sceneWidth / 2
            const y = (1 - projected.y) * sceneHeight / 2
            return x >= 20 && x <= sceneWidth - 20 && y >= copyBottom && y <= sceneHeight - 72
          })
          if (fits) low = candidate
          else high = candidate
        }
        if (low / distance > bestSize) {
          bestSize = low / distance
          mobileScale = low
          mobileDepth = distance
          mobileX = boat.position.x
        }
      }
      boat.position.z = -mobileDepth
      boat.position.x = mobileX
      boat.scale.setScalar(mobileScale)
      fitMobile = false
    }
    const opacity = ocean.uniforms.uBoatOpacity!.value as number
    material.uniforms.uOpacity!.value = OPACITY * opacity
    boat.visible = opacity > .001
  }

  if (!ocean.running) ocean.renderOnce()
}
