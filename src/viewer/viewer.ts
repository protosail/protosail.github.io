/**
 * Composition root, public API, and the one requestAnimationFrame in the viewer.
 *
 * Everything above this line is a module that knows one thing; this is where they get
 * wired together and where the frame order is decided:
 *
 *     simulate -> drive the joints -> settle materials -> move the camera ->
 *     render -> place the labels -> update the instruments
 *
 * Labels are placed *after* render because that's the point at which every world matrix
 * in the scene is guaranteed current, including the anchors riding the wing pivot.
 *
 * The surface below is deliberately small. The site mounts this into the boat section
 * and drives setView() from its scroll position; nothing outside src/viewer needs to
 * know that three.js is involved.
 */

import type { PerspectiveCamera, Scene } from 'three'
import { findView, VIEWS, type ViewDef } from '../config/views.js'
import { createLabels, type LabelOverlay } from '../ui/labels.js'
import { createCameraRig } from './camera.js'
import { interpolatePose, sampleTour } from './tour.js'
import { createMaterials } from './materials.js'
import { loadModel } from './model.js'
import { createRig } from './rig.js'
import { createSim, type Sim } from './sim.js'
import { createStage } from './stage.js'

export interface ViewerOptions {
  onProgress?(fraction: number): void
  reducedMotion?: boolean
  /** Draws the joint axes, for checking the rig against config/joints.ts. */
  debug?: boolean
  controls?: {
    /** Wheel zoom. Off inside a scrolling page, so the wheel keeps scrolling. */
    zoom?: boolean
    /** One-finger orbit. Off on phones, so one finger keeps scrolling; two fingers orbit. */
    oneFingerRotate?: boolean
  }
  /** Multiplies the guided cursor parallax without affecting other 3D scenes. */
  cursorParallax?: number
}

export type ViewerEvent = 'viewchange' | 'tick' | 'interact'

export interface BoatViewer {
  readonly sim: Sim
  readonly camera: PerspectiveCamera
  /** Exposed so a host page can add its own objects — and so QA can inspect state. */
  readonly scene: Scene
  readonly view: string
  readonly labels: LabelOverlay
  readonly running: boolean
  setView(id: string, instant?: boolean): void
  setTourProgress(progress: number): void
  /** Adds the restrained cursor parallax used by the hero; negative values reset it. */
  setPointer(x: number, y: number, strength?: number): void
  setInteractionMode(mode: 'guided' | 'explore'): void
  readonly interactionMode: 'guided' | 'explore'
  readonly tourProgress: number
  /** Whichever control the current view is about, for the panel's accent treatment. */
  readonly focusControl: 'wind' | 'tab' | 'rudder' | undefined
  /**
   * 'tick' handlers get the frame's delta in seconds; 'viewchange' and 'interact' get 0.
   * 'interact' fires the first time the reader takes the camera on each gesture.
   */
  on(event: ViewerEvent, handler: (dt: number) => void): () => void
  /** Pushes the subject right of centre by this fraction of the canvas width (0 = centred). */
  setLensShift(fraction: number): void
  /** Run the frame loop (while the stage is on screen). */
  start(): void
  /** Idle the GPU (while the stage is off screen). The simulation resumes where it left off. */
  stop(): void
  dispose(): void
}

export async function createBoatViewer(
  container: HTMLElement,
  options: ViewerOptions = {},
): Promise<BoatViewer> {
  const stage = createStage(container)
  let model: Awaited<ReturnType<typeof loadModel>>
  try {
    model = await loadModel(options.onProgress)
  } catch (error) {
    stage.dispose()
    throw error
  }
  stage.scene.add(model.root)

  const rig = createRig(model)
  rig.setHelpersVisible(Boolean(options.debug))

  const materials = createMaterials(model)
  const sim = createSim({ reducedMotion: options.reducedMotion })
  const cameraRig = createCameraRig(stage.camera, stage.canvas, {
    reducedMotion: options.reducedMotion,
    zoom: options.controls?.zoom,
    oneFingerRotate: options.controls?.oneFingerRotate,
    cursorParallax: options.cursorParallax,
    onUserInput: () => emit('interact'),
  })
  // Turning a phone sideways changes what fits; re-frame unless the reader has taken over.
  stage.onAspectChange = () => cameraRig.refit()
  const labels = createLabels(container, stage.camera, rig)

  const handlers: Record<ViewerEvent, Set<(dt: number) => void>> = {
    viewchange: new Set(),
    tick: new Set(),
    interact: new Set(),
  }
  const emit = (event: ViewerEvent, dt = 0) => handlers[event].forEach((fn) => fn(dt))

  let current: ViewDef = findView(null)
  let mode: 'guided' | 'explore' = 'guided'
  let tourProgress = 0
  let transitioning = false

  function applyView(view: ViewDef, instant: boolean, moveCamera = true) {
    current = view
    if (moveCamera) cameraRig.flyTo(view.camera, instant)
    labels.set(view.labels ?? [], view.dimensions ?? [])
    labels.update()
    materials.setHighlight(view.highlight)
    materials.setXray(Boolean(view.xray))
    // Views never touch a joint. They propose a state and the simulation decides —
    // and it declines once the reader has taken the controls.
    sim.suggest(view.sim ?? null)
    if (instant) sim.settle()
    emit('viewchange')
  }

  sim.settle()
  rig.setAngles(sim.state.wingDeg, sim.state.tabDeg, sim.state.rudderDeg)
  applyView(current, true)
  materials.update(1)

  // --- loop -----------------------------------------------------------------
  let raf = 0
  let last = performance.now()
  let running = false
  /** Whether the host wants us running; visibility can pause us underneath that. */
  let wanted = false

  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min((now - last) / 1000, 0.25)
    last = now

    sim.tick(dt)
    rig.setAngles(sim.state.wingDeg, sim.state.tabDeg, sim.state.rudderDeg)
    materials.update(dt)
    cameraRig.update(dt)

    stage.renderer.render(stage.scene, stage.camera)

    labels.setVisible(mode === 'guided' && !cameraRig.moving && (!transitioning || Boolean(options.reducedMotion)))
    labels.update()
    emit('tick', dt)
  }

  function start() {
    if (running || document.hidden) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  function stop() {
    if (!running) return
    running = false
    cancelAnimationFrame(raf)
  }

  // A backgrounded tab renders nothing: no point spinning a GPU for a page nobody is
  // looking at, and the sim picks up exactly where it left off.
  const onVisibility = () => (document.hidden || !wanted ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)

  const onContextLost = (event: Event) => {
    event.preventDefault()
    stop()
    container.classList.add('is-context-lost')
  }
  const onContextRestored = () => {
    container.classList.remove('is-context-lost')
    if (wanted) start()
  }
  stage.canvas.addEventListener('webglcontextlost', onContextLost)
  stage.canvas.addEventListener('webglcontextrestored', onContextRestored)

  wanted = true
  start()

  return {
    sim,
    camera: stage.camera,
    scene: stage.scene,
    labels,

    get view() {
      return current.id
    },

    get focusControl() {
      return current.focusControl
    },

    get running() {
      return running
    },

    get interactionMode() { return mode },
    get tourProgress() { return tourProgress },
    setInteractionMode(next) {
      if (next === mode) return
      mode = next
      cameraRig.setOrbitEnabled(mode === 'explore')
      if (mode === 'guided') {
        const frame = sampleTour(tourProgress, VIEWS.length)
        sim.set({ auto: true })
        applyView(VIEWS[frame.active], false, false)
        transitioning = frame.transitioning
        const pose = options.reducedMotion ? current.camera
          : interpolatePose(VIEWS[frame.from].camera, VIEWS[frame.to].camera, frame.mix)
        cameraRig.flyTo(pose)
      }
    },
    setTourProgress(progress) {
      tourProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
      if (mode === 'explore') return
      const frame = sampleTour(tourProgress, VIEWS.length)
      transitioning = frame.transitioning
      if (VIEWS[frame.active].id !== current.id) applyView(VIEWS[frame.active], Boolean(options.reducedMotion), false)
      cameraRig.follow(options.reducedMotion ? current.camera
        : interpolatePose(VIEWS[frame.from].camera, VIEWS[frame.to].camera, frame.mix))
    },
    setPointer(x, y, strength = 1) {
      cameraRig.setPointer(x, y, strength)
    },
    setView(id, instant = false) {
      const wasExploring = mode === 'explore'
      if (wasExploring) sim.set({ auto: true })
      mode = 'guided'
      cameraRig.setOrbitEnabled(false)
      transitioning = false
      tourProgress = Math.max(0, VIEWS.findIndex(view => view.id === id)) / (VIEWS.length - 1)
      const next = findView(id)
      if (next.id === current.id && !instant && !wasExploring) {
        cameraRig.flyTo(next.camera)
        return
      }
      applyView(next, instant)
    },

    on(event, handler) {
      handlers[event].add(handler)
      return () => handlers[event].delete(handler)
    },

    setLensShift(fraction) {
      stage.setLensShift(fraction)
    },

    start() {
      wanted = true
      start()
    },

    stop() {
      wanted = false
      stop()
    },

    dispose() {
      wanted = false
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      stage.canvas.removeEventListener('webglcontextlost', onContextLost)
      stage.canvas.removeEventListener('webglcontextrestored', onContextRestored)
      labels.dispose()
      cameraRig.dispose()
      materials.dispose()
      rig.dispose()
      model.dispose()
      stage.dispose()
    },
  }
}
