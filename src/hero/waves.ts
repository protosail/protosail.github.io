/**
 * The sea state, as numbers shared by the shader (through uniforms) and by anything on
 * the JavaScript side that needs to know how high the water is at a point — the ghost
 * boat rides `sampleHeight()`.
 *
 * Unequal crossing swells travel in curved, varying-height wave groups. The CPU
 * sampler uses the same field as the shader, including horizontal displacement.
 */

import { Vector2, Vector4 } from 'three'

export interface Wave {
  /** Direction of travel in the XZ plane (normalised here). */
  readonly dir: readonly [number, number]
  /** Wavelength, metres. */
  readonly length: number
  /** Amplitude, metres. */
  readonly amplitude: number
  /** Gerstner steepness 0..1 (0 = plain sine). */
  readonly steepness: number
}

export const WAVES: readonly Wave[] = [
  { dir: [1.0, 0.35], length: 17.3, amplitude: 1.02, steepness: 0.55 },
  { dir: [-0.6, 1.0], length: 11.1, amplitude: 0.64, steepness: 0.46 },
  { dir: [0.72, 0.69], length: 7.2, amplitude: 0.37, steepness: 0.40 },
  { dir: [-0.94, 0.28], length: 5.3, amplitude: 0.22, steepness: 0.35 },
  { dir: [0.2, -1.0], length: 3.7, amplitude: 0.14, steepness: 0.30 },
  { dir: [1.0, -0.7], length: 2.3, amplitude: 0.065, steepness: 0.25 },
  { dir: [-0.8, -0.45], length: 1.47, amplitude: 0.032, steepness: 0.20 },
]

export const WAVE_COUNT = WAVES.length

// A long swell takes about 14.5 seconds: slow, weighty movement behind the type.
// The post-hero acceleration is applied separately in ocean.ts.
export const TIME_SCALE = 0.22

const G = 9.81

interface Derived {
  dx: number
  dz: number
  k: number
  omega: number
  amplitude: number
  steepness: number
}

const DERIVED: readonly Derived[] = WAVES.map((w) => {
  const len = Math.hypot(w.dir[0], w.dir[1]) || 1
  const k = (2 * Math.PI) / w.length
  return {
    dx: w.dir[0] / len,
    dz: w.dir[1] / len,
    k,
    omega: Math.sqrt(G * k),
    amplitude: w.amplitude,
    steepness: w.steepness,
  }
})

/** Sum of amplitudes: the surface never leaves ±this (noise aside). */
export const MAX_HEIGHT = DERIVED.reduce((sum, w) => sum + w.amplitude, 0)

/** Uniform values the vertex shader reads. `t` is already time-scaled. */
export function waveUniforms(): { waves: Vector4[]; aq: Vector2[] } {
  return {
    waves: DERIVED.map((w) => new Vector4(w.dx, w.dz, w.k, w.omega)),
    aq: DERIVED.map((w) => new Vector2(w.amplitude, w.steepness)),
  }
}

/** Parameter-space surface, mirrored in OCEAN_VERT (including distant chop fade). */
export function sampleSurface(x: number, z: number, t: number): { x: number; y: number; z: number } {
  let px = x, y = 0, pz = z
  const fade = Math.max(0, Math.min(1, (-z - 8) / 27))
  for (const [i, w] of DERIVED.entries()) {
    const bend = (-w.dz * x + w.dx * z) * .14 + t * .12 + i * 2.4
    const group = (w.dx * x + w.dz * z) * .055 - t * .16 + i * 1.7
    const phase = (w.dx * x + w.dz * z) * w.k - w.omega * t + i * 2.399 + .7 * Math.sin(bend)
    const a = w.amplitude * (.72 + .28 * Math.sin(group)) * (i >= 4 ? 1 - fade * fade * (3 - 2 * fade) : 1)
    const shear = w.steepness * a * Math.cos(phase)
    px += w.dx * shear
    pz += w.dz * shear
    y += a * Math.sin(phase)
  }
  return { x: px, y, z: pz }
}

/** Invert horizontal Gerstner shear so the boat samples the visible world-space sea. */
export function sampleHeight(x: number, z: number, t: number): number {
  let u = x, v = z
  for (let i = 0; i < 6; i++) {
    const p = sampleSurface(u, v, t)
    u += x - p.x
    v += z - p.z
  }
  return sampleSurface(u, v, t).y
}
