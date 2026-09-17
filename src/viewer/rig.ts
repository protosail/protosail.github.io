/**
 * Turns three flat parts into three joints.
 *
 * The processed model has no hierarchy left — every part is a direct child of the scene
 * with its world transform baked in — which is exactly what makes this reliable: we drop
 * empty pivots at the measured axes, `attach()` the parts into them (attach preserves
 * world transform, so the boat doesn't twitch), and from then on a joint is one
 * `rotation.y`.
 *
 * The tail pivot is a child of the wing pivot, because the trim tab is bolted to the
 * wing assembly and swings with it. Its angle is therefore relative to the wing, which
 * is also how the real thing is instrumented.
 */

import { AxesHelper, Group, Object3D } from 'three'
import { JOINTS } from '../config/joints.js'
import { WING_ASSEMBLY } from '../config/parts.js'
import type { LoadedModel } from './model.js'

export type FrameId = 'wing' | 'tail' | 'rudder' | 'hull'

export interface Rig {
  /** Attach a label anchor here and it will ride the joint. */
  frame(id: FrameId | undefined): Object3D
  /**
   * Runs `fn` with every joint temporarily back at zero, then restores.
   *
   * Anything that positions itself by world coordinates measured off the model — label
   * anchors, most obviously — has to be built against the rest pose. Attach a point at
   * "0.56 m aft, on the tail vane" while the wing happens to be lying 22° off and
   * attach() will faithfully preserve the wrong world position.
   */
  atRest<T>(fn: () => T): T
  /** Degrees. Wing is absolute in the boat's frame; tab is relative to the wing. */
  setAngles(wingDeg: number, tabDeg: number, rudderDeg: number): void
  setHelpersVisible(visible: boolean): void
  dispose(): void
}

const DEG = Math.PI / 180

export function createRig(model: LoadedModel): Rig {
  const root = model.root
  root.updateMatrixWorld(true)

  const wingPivot = new Group()
  wingPivot.name = 'pivot:wing'
  wingPivot.position.set(JOINTS.wing.axis[0], 0, JOINTS.wing.axis[1])
  root.add(wingPivot)

  const tailPivot = new Group()
  tailPivot.name = 'pivot:tail'
  tailPivot.position.set(JOINTS.tail.axis[0], 0, JOINTS.tail.axis[1])
  root.add(tailPivot)

  const rudderPivot = new Group()
  rudderPivot.name = 'pivot:rudder'
  rudderPivot.position.set(JOINTS.rudder.axis[0], 0, JOINTS.rudder.axis[1])
  root.add(rudderPivot)

  root.updateMatrixWorld(true)

  // Order matters: load the tail pivot while it's still at the root and at rest, then
  // nest the whole thing under the wing pivot.
  tailPivot.attach(model.parts.tailVane)
  wingPivot.attach(tailPivot)
  for (const id of WING_ASSEMBLY) wingPivot.attach(model.parts[id])
  rudderPivot.attach(model.parts.rudder)

  // `?debug` in the URL draws the three axes so they can be checked against the numbers
  // in config/joints.ts without opening a modelling package.
  const helpers = [wingPivot, tailPivot, rudderPivot].map((pivot) => {
    const helper = new AxesHelper(0.35)
    helper.visible = false
    pivot.add(helper)
    return helper
  })

  const limitTab = JOINTS.tail.limitDeg
  const limitRudder = JOINTS.rudder.limitDeg

  return {
    frame(id) {
      switch (id) {
        case 'wing':
          return wingPivot
        case 'tail':
          return tailPivot
        case 'rudder':
          return rudderPivot
        default:
          return root
      }
    },

    atRest(fn) {
      const saved = [wingPivot.rotation.y, tailPivot.rotation.y, rudderPivot.rotation.y]
      wingPivot.rotation.y = 0
      tailPivot.rotation.y = 0
      rudderPivot.rotation.y = 0
      root.updateMatrixWorld(true)
      try {
        return fn()
      } finally {
        wingPivot.rotation.y = saved[0]
        tailPivot.rotation.y = saved[1]
        rudderPivot.rotation.y = saved[2]
        root.updateMatrixWorld(true)
      }
    },

    setAngles(wingDeg, tabDeg, rudderDeg) {
      wingPivot.rotation.y = wingDeg * DEG
      tailPivot.rotation.y = clamp(tabDeg, limitTab) * DEG
      rudderPivot.rotation.y = clamp(rudderDeg, limitRudder) * DEG
    },

    setHelpersVisible(visible) {
      for (const helper of helpers) helper.visible = visible
    },

    dispose() {
      for (const helper of helpers) {
        helper.removeFromParent()
        helper.dispose()
      }
    },
  }
}

function clamp(value: number, limit: number | null): number {
  return limit === null ? value : Math.max(-limit, Math.min(limit, value))
}
