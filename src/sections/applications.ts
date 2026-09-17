import { qs, qsa } from '../lib/dom.js'
import { coarsePointer, reducedMotion } from '../lib/scroll.js'
import { mountDepthImage } from './depthImage.js'

/** Move through the depth imagery inside fixed frames, as in the hero scene. */
export function initApplications(): void {
  if (coarsePointer || reducedMotion) return

  const section = qs<HTMLElement>('#applications')
  const scenes = qsa<HTMLElement>('.application__image', section).map(mountDepthImage)
  let pointerFrame = 0
  let pointerX = 0
  let pointerY = 0

  const applyPointer = (): void => {
    pointerFrame = 0
    const rect = section.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (pointerX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (pointerY - rect.top) / rect.height))
    for (const scene of scenes) scene.setPointer(x * 2 - 1, 1 - y * 2)
  }

  // Coalesce high-frequency pointer events into one layout read and one update per frame.
  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    pointerX = event.clientX
    pointerY = event.clientY
    if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer)
  }
  const onPointerLeave = (): void => {
    cancelAnimationFrame(pointerFrame)
    pointerFrame = 0
    for (const scene of scenes) scene.setPointer(0, 0)
  }
  const dispose = (): void => {
    cancelAnimationFrame(pointerFrame)
    section.removeEventListener('pointermove', onPointerMove)
    section.removeEventListener('pointerleave', onPointerLeave)
    for (const scene of scenes) scene.dispose()
  }

  section.addEventListener('pointermove', onPointerMove, { passive: true })
  section.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('pagehide', dispose, { once: true })
}
