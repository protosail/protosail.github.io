/**
 * The six things there are to look at.
 *
 * A view is purely declarative: where the camera goes, what gets annotated, and what
 * state the scene should be in. Views never write joint angles directly — they hand the
 * simulation a set of inputs and let it drive the rig, so nothing ever fights over the
 * wing. See viewer/views.ts for the applier.
 */

import type { PartId } from './parts.js'

export type Vec3 = [number, number, number]

export interface LabelDef {
  readonly text: string
  /** Supporting measurement, when the annotation needs one. */
  readonly sub?: string
  /** Anchor in rest-pose world space. */
  readonly at: Vec3
  /** Pivot the anchor rides on, so the label tracks a part that moves. */
  readonly follows?: 'wing' | 'tail' | 'rudder'
  /** Which way the leader line leaves the anchor, in screen space. */
  readonly dir?: [number, number]
  /** Leader length in px. */
  readonly reach?: number
}

export interface DimensionDef {
  readonly from: Vec3
  readonly to: Vec3
  readonly text: string
  /**
   * `dimension` (the default) draws a measured span with end ticks and, if nudged,
   * extension lines back to the feature. `reference` draws a plain dashed datum with
   * the text at its far end — the waterline, for instance.
   */
  readonly kind?: 'dimension' | 'reference'
  /** Push the dimension line off the measured axis, in screen px. */
  readonly nudge?: [number, number]
}

export interface CameraPose {
  readonly position: Vec3
  readonly target: Vec3
  /** Vertical field of view. Dropping it flattens perspective for profile views. */
  readonly fov?: number
}

export interface ViewDef {
  readonly id: string
  readonly label: string
  readonly caption: string
  readonly detail?: string
  readonly camera: CameraPose
  readonly labels?: readonly LabelDef[]
  readonly dimensions?: readonly DimensionDef[]
  /** Fade the hull, deck and panels to a fresnel shell so the bays show through. */
  readonly xray?: boolean
  /** Parts to lift out of the scene's general gloom. */
  readonly highlight?: readonly PartId[]
  /** Which control the view is really about; that one gets the accent treatment. */
  readonly focusControl?: 'wind' | 'tab' | 'rudder'
  /** Nudge the simulation somewhere illustrative on arrival. Omitted = leave it alone. */
  readonly sim?: { readonly windDeg?: number; readonly tabDeg?: number; readonly rudderDeg?: number }
}

const DEFAULT_FOV = 34

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    caption:
      'A two-metre sailing drone. Wind provides the drive; sunlight powers the electronics. Every component has a part in the crossing.',
    // 4.9 m out and 64° off the bow. Height sets the distance — the boat is 2 m long
    // but 2.43 m tall over the masthead — and the near-beam angle is what stops all
    // that height sitting in a narrow column in the middle of a wide frame.
    camera: { position: [-2.01, 1.49, 4.26], target: [0.05, 0.22, 0], fov: DEFAULT_FOV },
    labels: [],
  },

  {
    id: 'wingsail',
    label: 'Wingsail',
    caption:
      'The wing turns freely into the wind. A small trim tab steers it to an angle of attack, driven by a single servo. No sheets or winches.',
    camera: { position: [-1.63, 2.07, 2.52], target: [0.13, 0.63, 0], fov: 32 },
    /**
     * The one view that stops the wind wandering, because a 1.3 m × 0.33 m wing viewed
     * along its chord is a stick with the tail hidden behind it — and left to weathervane
     * it spends part of every cycle exactly there. No camera angle fixes that; the only
     * fix is to hold a heading that presents the section.
     *
     * Wind on the nose with 20° of tab puts the wing 10° off the wind, three-quarters to
     * the camera, with the boom across the view: the mechanism, in one frame. It's also
     * the state the reader is invited to take over — the tab slider is the accent
     * control here, and AUTO hands the wind back whenever they want it.
     */
    sim: { windDeg: 0, tabDeg: 20, rudderDeg: 0 },
    detail: '1.30 m span · 330 mm chord · Trim tab ±30°. Counterweights balance the free-pivot mast; a Hall sensor reads its angle with 6.1 mm clearance.',
    focusControl: 'tab',
    highlight: ['wing', 'wingFrame', 'tailVane', 'counterweightUpper', 'counterweightLower'],
    labels: [
      {
        text: 'Wing',
        at: [0.11, 1.16, 0.028],
        follows: 'wing',
        dir: [-1, -1],
        reach: 84,
      },
      {
        text: 'Trim tab',
        at: [0.564, 0.68, 0],
        follows: 'tail',
        dir: [1, -1],
        reach: 84,
      },
    ],
  },

  {
    id: 'rudder',
    label: 'Rudder',
    caption:
      'The other actuator. Two servos, this one and the trim tab, are the boat’s entire budget of moving parts for the crossing.',
    // Nearly dead astern and 30° up. Rudder movement is a yaw, and yaw reads best from
    // behind; from here the hull recedes up the frame instead of filling it, and the
    // sight line to the blade clears the stern overhang with 50 mm to spare.
    camera: { position: [2.05, 0.78, 1.39], target: [0.89, -0.18, 0], fov: 30 },
    sim: { windDeg: 0, tabDeg: 0, rudderDeg: 20 },
    detail: '±35° of travel · 66 mm sweep. The steering servo sits below deck.',
    focusControl: 'rudder',
    highlight: ['rudder'],
    labels: [
      {
        text: 'Rudder',
        at: [0.9, -0.24, 0.03],
        follows: 'rudder',
        dir: [1, 1],
        reach: 76,
      },
      {
        text: 'Stock',
        at: [0.886, 0.05, 0],
        follows: 'rudder',
        dir: [1, -1],
        reach: 66,
      },
    ],
  },

  {
    id: 'hull',
    label: 'Hull',
    // Beam is the one principal dimension a profile view can't draw, so the caption
    // carries it and the leaders carry the rest.
    caption:
      'Long, lean, and only 0.321 m across the beam. Almost a metre of fin under the waterline against 1.34 m of rig above it: built to be knocked flat and come back up.',
    // Long lens, well back: a near-orthographic profile, so the dimensions read true.
    // The frame has to hold 2.59 m — the LOA leader under the keel up to the masthead.
    camera: { position: [0.05, -0.13, 7.79], target: [0.05, -0.13, 0], fov: 26 },
    sim: { windDeg: 0, tabDeg: 0, rudderDeg: 0 },
    // Laid out the way the drawing would be: draft off the bow, rig off the stern,
    // length underneath, and the datum they're all measured from running through.
    dimensions: [
      { kind: 'reference', from: [-1.45, 0, 0], to: [1.55, 0, 0], text: 'Waterline' },
      { from: [-0.9436, -1.14, 0], to: [1.0564, -1.14, 0], text: 'Length 2 m' },
      { from: [-1.15, 0, 0], to: [-1.15, -0.9798, 0], text: 'Draft 0.98 m' },
      { from: [0.057, 0.1137, 0], to: [0.057, 1.4499, 0], text: 'Rig 1.34 m', nudge: [180, 0] },
    ],
  },

  {
    id: 'solar',
    label: 'Solar',
    caption:
      'Three arrays: bow, main and aft. The only fuel that ever comes aboard is daylight, so every flat piece of deck is working for a living.',
    camera: { position: [0.9, 3.3, 2.0], target: [0, 0.1, 0], fov: 32 },
    detail: 'Bow, main and aft arrays · 8 × 125 mm cells in the main array.',
    highlight: ['solarBow', 'solarMain', 'solarAft'],
    // Wind on the nose puts the wing fore-and-aft, which is the one heading where it
    // doesn't stand across the deck and hide the arrays.
    sim: { windDeg: 0, tabDeg: 0 },
    labels: [
      {
        text: 'Main array',
        at: [-0.28, 0.112, 0],
        dir: [-1, 1],
        reach: 80,
      },
      { text: 'Aft array', at: [0.575, 0.114, 0.09], dir: [1, 1], reach: 76 },
    ],
  },

  {
    id: 'electronics',
    label: 'Electronics',
    caption:
      'Navigation, comms and power live in two sealed bays under the main hatch. These 154 × 83 × 130 mm placeholder volumes are held for the real stack.',
    // Far enough out to keep the whole ghosted hull in frame: the bays only mean
    // something if you can see where in the boat they sit.
    camera: { position: [-1.4, 1.42, 1.89], target: [0.18, -0.12, 0], fov: 30 },
    xray: true,
    highlight: ['housingFwd', 'housingAft'],
    labels: [
      {
        text: 'Forward bay',
        at: [0.291, 0.006, 0.03],
        dir: [-1, -1],
        reach: 96,
      },
      {
        text: 'Aft bay',
        at: [0.456, 0.006, 0.03],
        dir: [1, -1],
        reach: 78,
      },
    ],
  },
] as const

export const DEFAULT_VIEW = VIEWS[0].id

export function findView(id: string | null | undefined): ViewDef {
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0]
}
