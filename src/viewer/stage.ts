/**
 * Renderer, scene and lighting. The transparent stage lets the page's shared
 * ocean atmosphere continue behind the boat without a separate backdrop.
 */

import {
  NeutralToneMapping,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export interface Stage {
  readonly renderer: WebGLRenderer
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly canvas: HTMLCanvasElement
  /** Called after the projection matrix is updated for a new aspect ratio. */
  onAspectChange: (() => void) | null
  resize(): void
  /**
   * Renders the left part of a virtually wider frame, so the authored framings land
   * right of centre — clear of a text column — without touching a single camera pose.
   * `fraction` is how far the optical axis moves right, as a fraction of the canvas width.
   */
  setLensShift(fraction: number): void
  dispose(): void
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = NeutralToneMapping
  // Keep the white gel coat below the surrounding ocean highlights, so the deck reads
  // as a shaped surface instead of a self-lit object.
  renderer.toneMappingExposure = 0.65
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap

  const canvas = renderer.domElement
  canvas.classList.add('stage-canvas')
  container.appendChild(canvas)

  const scene = new Scene()
  // A tight near/far pair matters here: the solar panels stack a cell field 0.1 mm under
  // a windowed frame, which z-fights on a loose depth range.
  const camera = new PerspectiveCamera(34, 1, 0.08, 60)
  camera.position.set(-2.05, 1.24, 2.28)

  // --- environment ----------------------------------------------------------
  const pmrem = new PMREMGenerator(renderer)
  const envRoom = new RoomEnvironment()
  const envTarget = pmrem.fromScene(envRoom, 0.04)
  scene.environment = envTarget.texture
  scene.environmentIntensity = 0.8
  envRoom.traverse((o) => {
    const m = o as Mesh
    if (m.geometry) m.geometry.dispose()
  })
  pmrem.dispose()

  // --- lights ---------------------------------------------------------------
  // One hard key doing all the shaping, a cool rim to pick the sheer line off the
  // background, and a hemisphere doing the job the sky and sea would do.
  // Kept below the level where the white deck clips: once it saturates, tone mapping compresses
  // everything above it to the same near-white and the views lose the ability to push a
  // part into the background by darkening it.
  const key = new DirectionalLight('#fff4e6', 1.1)
  key.position.set(-2.6, 4.2, 3.0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  // Wrapped tight around the boat. The light sits 5.84 m from the origin and the model's
  // bounding sphere is 1.82 m, so everything that can cast lives between 4.0 m and 7.7 m
  // — and a depth range that snug is what keeps acne off the big smooth wing.
  key.shadow.camera.near = 3.8
  key.shadow.camera.far = 8.2
  key.shadow.camera.left = -1.9
  key.shadow.camera.right = 1.9
  key.shadow.camera.top = 2.2
  key.shadow.camera.bottom = -1.9
  key.shadow.bias = -0.0002
  key.shadow.normalBias = 0.02
  key.shadow.radius = 3
  scene.add(key)

  // Neutral and from behind, to separate the yellow topsides and wing from an
  // equally dark background.
  const rim = new DirectionalLight('#ffffff', 0.8)
  rim.position.set(3.2, 1.1, -3.4)
  scene.add(rim)

  // Roughly what a sky and a sea would do, without pretending to be either.
  const fill = new HemisphereLight('#6b8cb5', '#0a0f16', 0.54)
  scene.add(fill)

  // There's no ground: the boat is presented in a void, so the only shadows that matter
  // are the ones it casts on itself — the wing across the deck, the rig on the topsides.
  // A contact shadow would need a visible floor, and a floor would fight the subject.

  // --- sizing ---------------------------------------------------------------
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const maxDpr = coarse ? 1.5 : 2
  let lensShift = 0

  function resize() {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr))
    renderer.setSize(w, h, false)
    // A wider virtual frame, of which we render the left `w` pixels: the optical axis
    // lands at (0.5 + lensShift) of the canvas.
    const full = Math.round(w * (1 + 2 * lensShift))
    const aspect = full / h
    const changed = aspect !== camera.aspect
    camera.aspect = aspect
    if (lensShift > 0) camera.setViewOffset(full, h, 0, 0, w, h)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    // Only after the projection is current: the listener re-frames against it.
    if (changed) stage.onAspectChange?.()
  }

  const ro = new ResizeObserver(resize)

  const stage: Stage = {
    renderer,
    scene,
    camera,
    canvas,
    onAspectChange: null,
    resize,
    setLensShift(fraction) {
      const next = Math.max(0, Math.min(0.4, fraction))
      if (next === lensShift) return
      lensShift = next
      resize()
    },
    dispose() {
      ro.disconnect()
      envTarget.dispose()
      key.dispose()
      rim.dispose()
      fill.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }

  resize()
  ro.observe(container)
  return stage
}
