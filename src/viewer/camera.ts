import { PerspectiveCamera, TOUCH, Vector2, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { CameraPose } from '../config/views.js'
import { interpolatePose } from './tour.js'
import { CURSOR_CAMERA } from '../lib/cursor.js'

export interface CameraRig {
  readonly controls: OrbitControls
  flyTo(pose: CameraPose, instant?: boolean): void
  follow(pose: CameraPose): void
  /** Normalized cursor coordinates; negative values ease the camera back to rest. */
  setPointer(x: number, y: number, strength?: number): void
  setOrbitEnabled(enabled: boolean): void
  update(dt: number): void
  refit(): void
  readonly moving: boolean
  dispose(): void
}
export interface CameraOptions {
  reducedMotion?: boolean
  zoom?: boolean
  oneFingerRotate?: boolean
  /** Per-viewer multiplier for guided cursor parallax. */
  cursorParallax?: number
  onUserInput?: () => void
}

export function createCameraRig(camera: PerspectiveCamera, canvas: HTMLElement, options: CameraOptions = {}): CameraRig {
  const controls = new OrbitControls(camera, canvas)
  controls.enableZoom = options.zoom !== false
  controls.enablePan = false
  controls.enableDamping = true
  controls.dampingFactor = 0.09
  controls.minDistance = .65
  controls.maxDistance = 12
  controls.minPolarAngle = .1
  controls.maxPolarAngle = Math.PI - .1
  controls.rotateSpeed = .7
  if (options.oneFingerRotate === false) controls.touches.ONE = null as never
  controls.touches.TWO = TOUCH.DOLLY_ROTATE
  canvas.style.touchAction = 'pan-y'
  let orbit = false
  controls.enabled = false
  let lastPose: CameraPose | null = null
  let basePose: CameraPose | null = null
  let tween: { from: CameraPose; to: CameraPose; t: number } | null = null
  const pointer = new Vector2()
  const pointerTarget = new Vector2()
  let pointerStrength = 0
  let pointerStrengthTarget = 0
  const cameraRight = new Vector3()
  const cameraUp = new Vector3()

  function fit(pose: CameraPose): CameraPose {
    if (camera.aspect >= 1.1) return pose
    const target = new Vector3(...pose.target)
    const away = new Vector3(...pose.position).sub(target).multiplyScalar(Math.min(1.1 / camera.aspect, 1.4))
    return { position: target.clone().add(away).toArray(), target: target.toArray(), fov: pose.fov ?? 34 }
  }
  function place(pose: CameraPose) {
    basePose = pose
    camera.position.set(...pose.position)
    controls.target.set(...pose.target)
    camera.fov = pose.fov ?? 34
    camera.updateProjectionMatrix()
    camera.lookAt(controls.target)
  }
  function presentation(): CameraPose {
    return basePose ?? { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov }
  }
  function applyPointer() {
    if (!basePose || orbit || options.reducedMotion || pointerStrength < 0.0005) return
    const target = new Vector3(...basePose.target)
    const distance = camera.position.distanceTo(target)
    cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    camera.position
      .addScaledVector(cameraRight, pointer.x * distance * CURSOR_CAMERA.x * (options.cursorParallax ?? 1) * pointerStrength)
      .addScaledVector(cameraUp, pointer.y * distance * CURSOR_CAMERA.y * (options.cursorParallax ?? 1) * pointerStrength)
    camera.lookAt(target)
  }
  const onInput = () => { tween = null; options.onUserInput?.() }
  const onTouch = (event: TouchEvent) => {
    if (orbit && event.touches.length > 1) event.preventDefault()
  }
  canvas.addEventListener('touchstart', onTouch, { passive: false })
  canvas.addEventListener('touchmove', onTouch, { passive: false })
  controls.addEventListener('start', onInput)
  return {
    controls,
    get moving() { return tween !== null },
    setOrbitEnabled(enabled) {
      if (orbit && !enabled) {
        basePose = { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov }
      }
      orbit = enabled
      controls.enabled = enabled
      if (enabled) {
        tween = null
        // Synchronize the orbit state with the live camera, with no residual damping.
        controls.enableDamping = false
        controls.update()
        controls.enableDamping = true
      }
      canvas.style.cursor = enabled ? 'grab' : ''
    },
    follow(pose) {
      lastPose = pose
      if (orbit) return
      if (tween) tween.to = fit(pose)
      else place(fit(pose))
    },
    setPointer(x, y, strength = 1) {
      pointerStrengthTarget = x >= 0 && y >= 0 && !options.reducedMotion
        ? Math.max(0, Math.min(1, strength))
        : 0
      if (pointerStrengthTarget) pointerTarget.set((x - 0.5) * 2, (0.5 - y) * 2)
    },
    flyTo(pose, instant = false) {
      lastPose = pose
      if (instant || options.reducedMotion) {
        tween = null
        place(fit(pose))
      } else tween = { from: presentation(), to: fit(pose), t: 0 }
    },
    refit() {
      if (!orbit && lastPose) {
        if (tween) tween.to = fit(lastPose)
        else place(fit(lastPose))
      }
    },
    update(dt) {
      if (orbit) controls.update(dt)
      else {
        if (tween) {
          tween.t = Math.min(1, tween.t + dt / .45)
          const t = tween.t
          place(interpolatePose(tween.from, tween.to, 1 - Math.pow(1 - t, 3)))
          if (t === 1) tween = null
        } else if (basePose) {
          place(basePose)
        }
        const follow = 1 - Math.exp(-dt / CURSOR_CAMERA.settle)
        pointer.lerp(pointerTarget, follow)
        pointerStrength += (pointerStrengthTarget - pointerStrength) * follow
        applyPointer()
      }
    },
    dispose() {
      canvas.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('touchmove', onTouch)
      controls.removeEventListener('start', onInput)
      controls.dispose()
    },
  }
}
