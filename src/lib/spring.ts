/**
 * A critically damped spring on one number: it follows a moving target with no
 * overshoot and can be re-targeted at any instant without a velocity discontinuity.
 * `omega` (rad/s) sets the response: 5 settles in roughly a second, 12 in a quarter.
 */
export interface Spring {
  readonly value: number
  readonly settled: boolean
  set(target: number): void
  /** Jump straight to a value, killing velocity. */
  snap(value: number): void
  update(dt: number): number
}

export function createSpring(omega = 6, initial = 0): Spring {
  let x = initial
  let v = 0
  let target = initial

  return {
    get value() {
      return x
    },
    get settled() {
      return Math.abs(x - target) < 1e-4 && Math.abs(v) < 1e-4
    },
    set(next) {
      target = next
    },
    snap(value) {
      x = target = value
      v = 0
    },
    update(dt) {
      // Semi-implicit Euler, sub-stepped so a long frame can't make the spring ring.
      const steps = Math.max(1, Math.ceil(dt * 120))
      const h = dt / steps
      for (let i = 0; i < steps; i++) {
        const a = -omega * omega * (x - target) - 2 * omega * v
        v += a * h
        x += v * h
      }
      return x
    },
  }
}
