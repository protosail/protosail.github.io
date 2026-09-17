/**
 * The three moving axes, measured in the source model's world space (metres, Y-up,
 * +X aft). All three are vertical, so a joint is fully described by where it crosses
 * the XZ plane.
 *
 * These numbers are the reason scripts/process-model.mjs is forbidden from centering or
 * re-orienting the model, and the reason it verifies that nothing drifted more than a
 * micron or two.
 */

export interface Joint {
  /** World X and Z of the vertical rotation axis. */
  readonly axis: readonly [number, number]
  /** Travel limit either side of rest, in degrees. `null` means the joint spins freely. */
  readonly limitDeg: number | null
}

export const JOINTS = {
  /**
   * The mast. The whole wing assembly — foil, frame, both counterweights and the tail
   * boom — turns on this and nothing restrains it: no sheet, no winch, 360° of travel.
   * Closest approach to the hall sensor on the deck is 6.1 mm, so it really does clear.
   */
  wing: { axis: [0.056955, 0.000182], limitDeg: null },

  /**
   * The trim tab, out on the boom aft of the wing. This is the only thing a servo
   * touches up there; it rides on the wing assembly, so its angle is relative to the
   * wing, not to the boat.
   */
  tail: { axis: [0.491955, 0.000364], limitDeg: 30 },

  /** The rudder stock. 66 mm of blade sweep at the trailing edge. */
  rudder: { axis: [0.88644, -0.00025], limitDeg: 35 },
} as const satisfies Record<string, Joint>

export type JointId = keyof typeof JOINTS

/**
 * How hard the tab flies the wing.
 *
 * At equilibrium the tail is carrying no net moment about the mast, which for an ideal
 * weightless tail would put the wing at an angle of attack of exactly minus the tab
 * deflection. A real wing generates its own restoring moment about a pivot set at ~33%
 * chord, so the two share the load and the wing settles at rather less than that:
 *
 *     wing heading = apparent wind - TAB_AUTHORITY * tab deflection
 *
 * 0.5 puts full tab (±30°) at ±15° angle of attack, which is about where this rig lives.
 */
export const TAB_AUTHORITY = 0.5

/** Second-order response of the free-pivoting wing: undamped frequency and damping. */
export const WING_OMEGA = 2.0 // rad/s
export const WING_ZETA = 0.9 // just under critical — one small overshoot, no hunting

/** Servo slew limits, degrees per second. Both are small hobby servos under low load. */
export const TAB_SLEW = 140
export const RUDDER_SLEW = 160
