import { MathUtils, Spherical, Vector3 } from 'three'
import type { CameraPose } from '../config/views.js'

/** First half of a chapter is a still reading interval, followed by a reversible move. */
export function sampleTour(progress: number, count: number) {
  const last = Math.max(0, count - 1)
  const p = (Number.isFinite(progress) ? MathUtils.clamp(progress, 0, 1) : 0) * last
  const from = Math.floor(p)
  const to = Math.min(from + 1, last)
  const t = MathUtils.clamp((p - from - 0.5) / 0.5, 0, 1)
  const mix = t * t * (3 - 2 * t)
  return { from, to, mix, active: mix < 0.5 ? from : to, transitioning: mix > 0.001 && mix < 0.999 }
}

/** Shortest spherical path: never interpolate straight through the hull. */
export function interpolatePose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const targetA = new Vector3(...a.target), targetB = new Vector3(...b.target)
  const sa = new Spherical().setFromVector3(new Vector3(...a.position).sub(targetA))
  const sb = new Spherical().setFromVector3(new Vector3(...b.position).sub(targetB))
  while (sb.theta - sa.theta > Math.PI) sb.theta -= Math.PI * 2
  while (sb.theta - sa.theta < -Math.PI) sb.theta += Math.PI * 2
  const s = new Spherical(
    MathUtils.lerp(sa.radius, sb.radius, t),
    MathUtils.lerp(sa.phi, sb.phi, t),
    MathUtils.lerp(sa.theta, sb.theta, t),
  )
  const target = targetA.lerp(targetB, t)
  return {
    position: target.clone().add(new Vector3().setFromSpherical(s)).toArray(),
    target: target.toArray(),
    fov: MathUtils.lerp(a.fov ?? 34, b.fov ?? 34, t),
  }
}
