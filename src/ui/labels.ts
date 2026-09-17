/**
 * Callouts and dimension leaders, drawn in HTML and SVG over the canvas.
 *
 * Text stays in the DOM rather than becoming a texture: it's crisp at any pixel ratio,
 * it's selectable, and it's readable by a screen reader. Everything the loop touches per
 * frame is a transform or an SVG attribute — no layout is ever read while running.
 *
 * Anchors that belong to a moving part are parented into that part's pivot, so a label
 * on the trim tab swings with the trim tab without any bookkeeping here.
 */

import { Object3D, PerspectiveCamera, Vector3 } from 'three'
import type { DimensionDef, LabelDef } from '../config/views.js'
import type { Rig } from '../viewer/rig.js'

export interface LabelOverlay {
  set(labels: readonly LabelDef[], dimensions: readonly DimensionDef[]): void
  setVisible(visible: boolean): void
  update(): void
  dispose(): void
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

interface LabelItem {
  def: LabelDef
  anchor: Object3D
  box: HTMLElement
  leader: SVGPathElement
  shown: boolean
  /** Which way the leader currently points; flips when it would push the box off-screen. */
  dirX: number
  /** Measured once per viewport width — never inside the frame loop. */
  width: number
  height: number
  /** Scratch, written by the layout pass each frame. */
  x: number
  y: number
  kneeX: number
  kneeY: number
  endX: number
}

interface DimensionItem {
  def: DimensionDef
  from: Vector3
  to: Vector3
  box: HTMLElement
  line: SVGPathElement
  shown: boolean
}

export function createLabels(
  container: HTMLElement,
  camera: PerspectiveCamera,
  rig: Rig,
): LabelOverlay {
  const layer = document.createElement('div')
  layer.className = 'labels'
  layer.setAttribute('aria-hidden', 'false')

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'labels-svg')
  svg.setAttribute('aria-hidden', 'true')
  layer.appendChild(svg)

  const boxes = document.createElement('div')
  boxes.className = 'labels-boxes'
  layer.appendChild(boxes)

  container.appendChild(layer)

  let labels: LabelItem[] = []
  let dimensions: DimensionItem[] = []
  /** Viewport width the label boxes were last measured at. */
  let measuredAt = -1
  const world = new Vector3()
  const projected = new Vector3()

  function clear() {
    for (const item of labels) {
      item.anchor.removeFromParent()
      item.box.remove()
      item.leader.remove()
    }
    for (const item of dimensions) {
      item.box.remove()
      item.line.remove()
    }
    labels = []
    dimensions = []
  }

  function project(point: Vector3): { x: number; y: number; onScreen: boolean } {
    projected.copy(point).project(camera)
    const w = container.clientWidth
    const h = container.clientHeight
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
      onScreen:
        projected.z < 1 &&
        projected.x > -1.25 &&
        projected.x < 1.25 &&
        projected.y > -1.25 &&
        projected.y < 1.25,
    }
  }

  return {
    set(nextLabels, nextDimensions) {
      clear()

      // Anchors are world coordinates read off the model at rest, so the joints have to
      // be at rest while they're attached — otherwise a label on the tail vane is
      // pinned to wherever that point happened to be with the wing 22° off.
      const anchors = rig.atRest(() =>
        nextLabels.map((def) => {
          const anchor = new Object3D()
          anchor.position.set(...def.at)
          // attach(), not add(): preserves the world position while re-parenting.
          rig.frame(def.follows).attach(anchor)
          return anchor
        }),
      )

      nextLabels.forEach((def, index) => {
        const anchor = anchors[index]

        // Two nested elements on purpose: the outer one carries the projected position
        // (a transform the loop rewrites), the inner one carries the alignment offset
        // (a transform CSS owns). Combining them would mean recomputing both in JS.
        const box = document.createElement('div')
        const dirX = def.dir?.[0] ?? 1
        box.className = `label ${dirX >= 0 ? 'label--right' : 'label--left'}`
        const inner = document.createElement('div')
        inner.className = 'label-inner'
        const text = document.createElement('span')
        text.className = 'label-text'
        text.textContent = def.text
        inner.appendChild(text)
        if (def.sub) {
          const sub = document.createElement('span')
          sub.className = 'label-sub'
          sub.textContent = def.sub
          inner.appendChild(sub)
        }
        box.appendChild(inner)
        boxes.appendChild(box)

        const leader = document.createElementNS(SVG_NS, 'path')
        leader.setAttribute('class', 'label-leader')
        svg.appendChild(leader)

        labels.push({
          def,
          anchor,
          box,
          leader,
          shown: true,
          dirX,
          width: 0,
          height: 30,
          x: 0,
          y: 0,
          kneeX: 0,
          kneeY: 0,
          endX: 0,
        })
      })
      measuredAt = -1

      for (const def of nextDimensions) {
        const reference = def.kind === 'reference'
        const box = document.createElement('div')
        box.className = reference ? 'dimension dimension--reference' : 'dimension'
        const inner = document.createElement('span')
        inner.className = 'dimension-inner'
        inner.textContent = def.text
        box.appendChild(inner)
        boxes.appendChild(box)

        const line = document.createElementNS(SVG_NS, 'path')
        line.setAttribute('class', reference ? 'dimension-line is-reference' : 'dimension-line')
        svg.appendChild(line)

        dimensions.push({
          def,
          from: new Vector3(...def.from),
          to: new Vector3(...def.to),
          box,
          line,
          shown: true,
        })
      }
    },

    setVisible(visible) {
      layer.classList.toggle('is-hidden', !visible)
      layer.setAttribute('aria-hidden', String(!visible))
    },

    update() {
      const w = container.clientWidth
      const h = container.clientHeight

      // One layout flush per viewport width, never per frame. Box widths change with the
      // viewport because the mono sub-line is dropped on small screens.
      if (measuredAt !== w) {
        measuredAt = w
        for (const item of labels) {
          const inner = item.box.firstElementChild as HTMLElement
          item.width = inner.offsetWidth
          item.height = inner.offsetHeight
        }
      }

      // A phone can hold about three callouts before they start reading as a pile rather
      // than as annotation. Views list their labels most-important first.
      const budget = w < 520 ? 1 : Math.min(2, labels.length)

      // Pass one: where each callout wants to be.
      const placed: LabelItem[] = []
      for (const [index, item] of labels.entries()) {
        item.anchor.getWorldPosition(world)
        const { x, y, onScreen: inFrustum } = project(world)
        const onScreen = inFrustum && index < budget

        if (onScreen !== item.shown) {
          item.shown = onScreen
          item.box.classList.toggle('is-off', !onScreen)
          item.leader.classList.toggle('is-off', !onScreen)
        }
        if (!onScreen) continue

        const dirY = item.def.dir?.[1] ?? -1
        const reach = (item.def.reach ?? 64) * (w < 860 ? .65 : 1)

        // Flip the callout back inboard when the authored direction would run it off the
        // edge — which happens constantly on a phone, and whenever anyone orbits.
        const need = reach * 1.15 + item.width + 14
        let dirX = item.def.dir?.[0] ?? 1
        if (dirX > 0 && x > w - need) dirX = -1
        else if (dirX < 0 && x < need) dirX = 1
        if (dirX !== item.dirX) {
          item.dirX = dirX
          item.box.classList.toggle('label--right', dirX >= 0)
          item.box.classList.toggle('label--left', dirX < 0)
        }

        // Diagonal out of the anchor, then a short horizontal run into the text —
        // the way a callout is drawn on a drawing.
        item.x = x
        item.y = y
        item.kneeX = x + dirX * reach * 0.6
        item.kneeY = clamp(y + dirY * reach * 0.62, item.height + 12, h - 34)
        // Last resort when neither side has room: hold the box inside the viewport and
        // let the horizontal run stretch or shorten to reach it.
        item.endX = clamp(
          item.kneeX + dirX * reach * 0.5,
          dirX >= 0 ? 8 : item.width + 12,
          dirX >= 0 ? Math.max(8, w - item.width - 12) : w - 8,
        )
        placed.push(item)
      }

      // Pass two: two callouts can easily want the same patch of screen — the trim tab
      // and a counterweight end up a few pixels apart at some wing angles. Push them
      // apart down each side independently; left and right boxes can't collide.
      for (const side of [1, -1]) {
        const column = placed.filter((item) => item.dirX === side).sort((a, b) => a.kneeY - b.kneeY)
        for (let i = 1; i < column.length; i++) {
          const gap = column[i - 1].height + 8
          if (column[i].kneeY - column[i - 1].kneeY < gap) {
            column[i].kneeY = column[i - 1].kneeY + gap
          }
        }
        const last = column[column.length - 1]
        const overflow = last ? last.kneeY - (h - 34) : 0
        if (overflow > 0) for (const item of column) item.kneeY -= overflow
      }

      // Pass three: write.
      for (const item of placed) {
        // Draw through the full label width in the same path. A separate CSS
        // underline can leave a subpixel seam where the two renderers meet.
        const lineEndX = item.endX + Math.sign(item.dirX) * item.width
        item.leader.setAttribute(
          'd',
          `M${item.x.toFixed(1)} ${item.y.toFixed(1)}` +
            `L${item.kneeX.toFixed(1)} ${item.kneeY.toFixed(1)}` +
            `L${lineEndX.toFixed(1)} ${item.kneeY.toFixed(1)}`,
        )
        item.box.style.transform =
          `translate3d(${item.endX.toFixed(1)}px, ${item.kneeY.toFixed(1)}px, 0)`
      }

      for (const item of dimensions) {
        const a = project(item.from)
        const b = project(item.to)
        const onScreen = a.onScreen && b.onScreen
        if (onScreen !== item.shown) {
          item.shown = onScreen
          item.box.classList.toggle('is-off', !onScreen)
          item.line.classList.toggle('is-off', !onScreen)
        }
        if (!onScreen) continue

        const nudgeX = (item.def.nudge?.[0] ?? 0) * Math.min(1, w / 1000)
        const nudgeY = item.def.nudge?.[1] ?? 0
        const ax = a.x + nudgeX
        const ay = a.y + nudgeY
        const bx = b.x + nudgeX
        const by = b.y + nudgeY

        // Unit vector along the dimension, and its perpendicular, for the end ticks.
        const dx = bx - ax
        const dy = by - ay
        const len = Math.hypot(dx, dy) || 1
        const px = (-dy / len) * 6
        const py = (dx / len) * 6

        if (item.def.kind === 'reference') {
          // A datum, not a measurement: one dashed line, text sitting just past its end.
          item.line.setAttribute('d', `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`)
          const tx = clamp(bx + (dx / len) * 30, 45, w - 45)
          const ty = by + (dy / len) * 30 - 9
          item.box.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`
          continue
        }

        item.line.setAttribute(
          'd',
          // extension lines from the measured points, then the dimension line and ticks
          `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}` +
            `M${b.x.toFixed(1)} ${b.y.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}` +
            `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}` +
            `M${(ax - px).toFixed(1)} ${(ay - py).toFixed(1)}L${(ax + px).toFixed(1)} ${(ay + py).toFixed(1)}` +
            `M${(bx - px).toFixed(1)} ${(by - py).toFixed(1)}L${(bx + px).toFixed(1)} ${(by + py).toFixed(1)}`,
        )

        const midX = (ax + bx) / 2 + px * 2.6
        const midY = (ay + by) / 2 + py * 2.6
        item.box.style.transform = `translate3d(${midX.toFixed(1)}px, ${midY.toFixed(1)}px, 0)`
      }

      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    },

    dispose() {
      clear()
      layer.remove()
    },
  }
}
