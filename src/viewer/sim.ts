/**
 * The mechanism, as physics rather than as animation.
 *
 * Nothing else in the viewer is allowed to write a joint angle. Views and controls hand
 * this module inputs — an apparent wind direction, a tab command, a rudder command — and
 * it decides where the wing actually ends up. That single-writer rule is why changing
 * view mid-gust doesn't make the wing jump.
 *
 * The interesting one is the wing. It isn't driven at all: it's a free-pivoting mass with
 * a tail on a boom, so it's modelled as a damped second-order system chasing an
 * equilibrium heading that the tab sets. Deflect the tab and the wing swings away from
 * the wind by an angle of attack — which is the whole trick of a self-trimming wingsail
 * and the thing this page exists to show.
 */

import {
  RUDDER_SLEW,
  TAB_AUTHORITY,
  TAB_SLEW,
  WING_OMEGA,
  WING_ZETA,
  JOINTS,
} from '../config/joints.js'

export interface SimInputs {
  /**
   * Where the apparent wind comes from, relative to the bow, in degrees. 0 means dead
   * ahead — the wing then lies fore-and-aft with its trailing edge aft, which is the
   * model's rest pose.
   */
  windDeg: number
  /** Commanded trim tab angle, degrees, relative to the wing. */
  tabDeg: number
  /** Commanded rudder angle, degrees. */
  rudderDeg: number
  /** Let the wind wander and the servos work on their own. */
  auto: boolean
}

export interface SimState {
  readonly windDeg: number
  readonly tabDeg: number
  readonly rudderDeg: number
  /** Where the wing has actually got to. */
  readonly wingDeg: number
  /** Wing heading minus wind: the angle of attack the tab is holding. */
  readonly aoaDeg: number
  readonly auto: boolean
}

export interface Sim {
  readonly state: SimState
  readonly inputs: Readonly<SimInputs>
  /**
   * A person changed something. This latches: from here on the views stop proposing
   * poses of their own, because the reader is driving. Passing `auto: true` — the AUTO
   * button — hands control back.
   */
  set(patch: Partial<SimInputs>): void
  /**
   * A view would like the boat in a particular attitude. Ignored once someone has taken
   * the controls. `null` means "no preference", which is the cue to resume AUTO.
   */
  suggest(patch: Partial<SimInputs> | null): void
  /** Jump straight to the commanded state — used when a view arrives, or on first paint. */
  settle(): void
  tick(dt: number): void
}

const TAB_LIMIT = JOINTS.tail.limitDeg ?? 30
const RUDDER_LIMIT = JOINTS.rudder.limitDeg ?? 35

/** Shortest signed difference between two headings, in degrees. */
function wrap180(deg: number): number {
  return deg - 360 * Math.round(deg / 360)
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current
  return Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep
}

export function createSim(options: { reducedMotion?: boolean } = {}): Sim {
  const inputs: SimInputs = { windDeg: -26, tabDeg: 0, rudderDeg: 0, auto: true }

  /** Has a person taken the controls? Views defer to them once this is true. */
  let held = false
  let clock = 0
  let wingDeg = 0
  let wingRate = 0
  let tabDeg = 0
  let rudderDeg = 0

  const state = {
    windDeg: inputs.windDeg,
    tabDeg: 0,
    rudderDeg: 0,
    wingDeg: 0,
    aoaDeg: 0,
    auto: true,
  }

  /**
   * Auto mode. Three detuned sines per channel rather than noise, so the motion never
   * repeats on any timescale you'd notice but is completely deterministic — no seeds, no
   * divergence between the HUD and the model, and it can be resumed after a pause.
   */
  /**
   * The phases are chosen, not arbitrary: at t = 0 this sits near −40°, which is where
   * the wing presents its section to the Overview camera instead of edging on to it.
   * A first impression of a blue stick is a poor advertisement for a wingsail.
   */
  function autoWind(t: number): number {
    return (
      40 * Math.sin(t * 0.037 + 3.6) + 26 * Math.sin(t * 0.071 + 4.2) + 14 * Math.sin(t * 0.131)
    )
  }
  function autoTab(t: number): number {
    return 17 * Math.sin(t * 0.089 + 2.2) + 9 * Math.sin(t * 0.211 + 0.9)
  }
  function autoRudder(t: number): number {
    return 14 * Math.sin(t * 0.061 + 1.1) + 6 * Math.sin(t * 0.157 + 2.6)
  }

  /** The heading the wing is trying to reach, given the wind and where the tab is. */
  function equilibrium(): number {
    return commandedWind() - TAB_AUTHORITY * tabDeg
  }

  function commandedWind(): number {
    if (!inputs.auto || options.reducedMotion) return inputs.windDeg
    return autoWind(clock)
  }
  function commandedTab(): number {
    if (!inputs.auto || options.reducedMotion) return clamp(inputs.tabDeg, TAB_LIMIT)
    return clamp(autoTab(clock), TAB_LIMIT)
  }
  function commandedRudder(): number {
    if (!inputs.auto || options.reducedMotion) return clamp(inputs.rudderDeg, RUDDER_LIMIT)
    return clamp(autoRudder(clock), RUDDER_LIMIT)
  }

  function assign(patch: Partial<SimInputs>) {
    Object.assign(inputs, patch)
    inputs.tabDeg = clamp(inputs.tabDeg, TAB_LIMIT)
    inputs.rudderDeg = clamp(inputs.rudderDeg, RUDDER_LIMIT)
  }

  function publish() {
    state.windDeg = wrap180(commandedWind())
    state.tabDeg = tabDeg
    state.rudderDeg = rudderDeg
    state.wingDeg = wrap180(wingDeg)
    state.aoaDeg = wrap180(wingDeg - commandedWind())
    state.auto = inputs.auto
  }

  function step(dt: number) {
    tabDeg = approach(tabDeg, commandedTab(), TAB_SLEW * dt)
    rudderDeg = approach(rudderDeg, commandedRudder(), RUDDER_SLEW * dt)

    // Damped second-order response toward the tab-set heading, integrated semi-implicitly
    // so it stays stable if a frame runs long.
    const error = wrap180(equilibrium() - wingDeg)
    const accel = WING_OMEGA * WING_OMEGA * error - 2 * WING_ZETA * WING_OMEGA * wingRate
    wingRate += accel * dt
    wingDeg += wingRate * dt
  }

  return {
    state,
    inputs,

    set(patch) {
      held = patch.auto !== true
      assign(patch)
      publish()
    },

    suggest(patch) {
      if (held) return
      if (!patch) {
        inputs.auto = true
      } else {
        assign({ auto: false, ...patch })
      }
      publish()
    },

    settle() {
      tabDeg = commandedTab()
      rudderDeg = commandedRudder()
      wingDeg = equilibrium()
      wingRate = 0
      publish()
    },

    tick(dt) {
      clock += dt
      // Fixed sub-steps: the spring is stiff enough that a 100 ms frame integrated in one
      // go would ring, and a backgrounded tab can hand us much worse than 100 ms.
      const budget = Math.min(dt, 0.25)
      const steps = Math.max(1, Math.ceil(budget / 0.008))
      const h = budget / steps
      for (let i = 0; i < steps; i++) step(h)
      publish()
    },
  }
}
