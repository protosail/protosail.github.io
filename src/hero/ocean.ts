/** The sea and boat share a clock and an antialiased, high-DPI canvas.
 * A pixel budget bounds GPU cost without the old subpixel-resolution silhouette. */
import {
  Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, NoToneMapping,
  PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, ShaderMaterial,
  SRGBColorSpace, Vector2, WebGLRenderer,
} from 'three'
import { OCEAN_FRAG, OCEAN_VERT } from './ocean.glsl.js'
import { TIME_SCALE, waveUniforms } from './waves.js'
import { FOG_FRAG, FOG_VERT } from './fog.glsl.js'

export interface OceanOptions { reducedMotion?: boolean; coarse?: boolean }
export interface Ocean {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  readonly uniforms: Record<string, { value: unknown }>
  readonly time: number
  readonly running: boolean
  readonly disposed: boolean
  onFrame: ((dt: number, time: number) => void) | null
  onDispose: (() => void) | null
  setScroll(progress: number): void
  setPointer(x: number, y: number, strength?: number): void
  setMotion(enabled: boolean): void
  start(): void
  stop(): void
  renderOnce(): void
  dispose(): void
}

/** A tiny, seamless normal/foam lookup made once; no asset download or per-pixel noise loops. */
function waterDetail() {
  const size = 128, pixels = new Uint8Array(size * size * 4)
  const hash = (x: number, y: number, period: number) => {
    let n = Math.imul((x + period) % period, 374761393) ^ Math.imul((y + period) % period, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
  }
  const noise = (x: number, y: number, period: number) => {
    const u = x / size * period, v = y / size * period
    const ix = Math.floor(u), iy = Math.floor(v)
    const fx = u-ix, fy = v-iy, sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy)
    const a = hash(ix,iy,period), b = hash(ix+1,iy,period)
    const c = hash(ix,iy+1,period), d = hash(ix+1,iy+1,period)
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy
  }
  const field = new Float32Array(size*size)
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    field[y*size+x] = noise(x,y,8)*.45 + noise(x,y,16)*.3 + noise(x,y,32)*.17 + noise(x,y,64)*.08
  }
  const h = (x: number, y: number) => field[((y+size)%size)*size+(x+size)%size]
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const i = (y*size+x)*4
    pixels[i] = Math.max(0,Math.min(255,128+(h(x-1,y)-h(x+1,y))*500))
    pixels[i+1] = Math.max(0,Math.min(255,128+(h(x,y-1)-h(x,y+1))*500))
    pixels[i+2] = h(x,y)*255
    pixels[i+3] = 255
  }
  const texture = new DataTexture(pixels,size,size)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export function createOcean(container: HTMLElement, options: OceanOptions = {}): Ocean {
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = NoToneMapping
  renderer.setClearColor(0x05080d,1)
  const canvas = renderer.domElement
  canvas.classList.add('ocean-canvas')
  container.appendChild(canvas)
  const scene = new Scene()
  const camera = new PerspectiveCamera(42,1,.1,150)
  const cameraRestY = 3.1
  const cameraRestPitch = -7 * Math.PI / 180
  camera.position.set(0,cameraRestY,0)
  camera.rotation.x = cameraRestPitch

  // Fit the grid to the camera on resize, concentrating detail in the visible sea.
  const small = options.coarse || container.clientWidth < 860
  const geometry = new PlaneGeometry(1,1,small ? 112 : 192,small ? 160 : 256)
  const positions = geometry.getAttribute('position')
  const grid = geometry.getAttribute('uv')
  const detail = waterDetail()
  const { waves, aq } = waveUniforms()
  const uniforms = {
    uTime: { value: 37 }, uWaves: { value: waves }, uWaveAQ: { value: aq },
    uDetail: { value: detail }, uBg: { value: new Color('#05080d') }, uOpacity: { value: 1 },
    uBoatOpacity: { value: 1 }, uAspect: { value: 1 },
    uPointer: { value: new Vector2(.72, .42) }, uPointerStrength: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
  }
  const material = new ShaderMaterial({ uniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG })
  material.toneMapped = false
  const mesh = new Mesh(geometry,material)
  mesh.frustumCulled = false
  scene.add(mesh)

  // A screen-space veil shares the sea's texture and clock, including pause/reduce.
  const fogGeometry = new PlaneGeometry(2, 2)
  const fogMaterial = new ShaderMaterial({
    uniforms, vertexShader: FOG_VERT, fragmentShader: FOG_FRAG,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  })
  const fog = new Mesh(fogGeometry, fogMaterial)
  fog.frustumCulled = false
  fog.renderOrder = 10
  scene.add(fog)

  let time = 37, running = false, wanted = false, contextLost = false, raf = 0
  let disposed = false
  let motion = !options.reducedMotion
  let scrollSpeed = 1
  const pointer = (uniforms.uPointer.value as Vector2).clone()
  const pointerTarget = pointer.clone()
  const cameraDrift = new Vector2()
  const cameraDriftTarget = new Vector2()
  let pointerStrength = 0, pointerStrengthTarget = 0
  let last = 0, sampleStart = 0, samples = 0, reports = 0, warmFrames = 0, renderTotal = 0
  const debug = new URLSearchParams(location.search).has('debug')
  if (debug) {
    const gl = renderer.getContext()
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    console.info('Ocean renderer ' + (info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)))
  }
  function render(dt = 0) {
    if (contextLost) return
    if (dt > 0) {
      const follow = 1-Math.exp(-dt/.45)
      pointer.lerp(pointerTarget, follow)
      pointerStrength += (pointerStrengthTarget-pointerStrength) * (1-Math.exp(-dt/.5))
      uniforms.uPointer.value.copy(pointer)
      uniforms.uPointerStrength.value = pointerStrength
      if (!options.reducedMotion) cameraDrift.lerp(cameraDriftTarget,1-Math.exp(-dt/.58))
    }
    // A tiny camera drift gives the water and prototype real parallax while the
    // interface remains fixed. The restrained range keeps the horizon composed.
    camera.position.x = cameraDrift.x*.18
    camera.position.y = cameraRestY+cameraDrift.y*.072
    camera.rotation.x = cameraRestPitch+cameraDrift.y*.011
    camera.rotation.y = -cameraDrift.x*.016
    uniforms.uTime.value = time
    ocean.onFrame?.(Math.min(dt,.1),time)
    renderer.render(scene,camera)
  }
  function tick(now: number) {
    if (!running) return
    const dt = (now-last)/1000
    last = now
    // Ignore long stalls so the next visible frame never jumps across a swell.
    // Integrate speed into the shared clock; changing scroll direction cannot jump
    // the wave phase or separate the fog and the boat from the water.
    time += Math.min(dt,.08) * TIME_SCALE * scrollSpeed
    const began = performance.now()
    render(dt)
    renderTotal += performance.now()-began
    // Exclude one-off shader compilation from the frame-rate sample.
    if (warmFrames++ < 3) { sampleStart = now; samples = 0; renderTotal = 0 }
    samples++
    if (now-sampleStart > 2200) {
      const fps = samples*1000/(now-sampleStart)
      if (debug && reports++ < 4) console.info('Ocean performance ' + JSON.stringify({ fps: Math.round(fps), pixels: canvas.width*canvas.height, renderMs: Math.round(renderTotal/samples*10)/10 }))
      sampleStart = now
      samples = 0
      renderTotal = 0
    }
    raf = requestAnimationFrame(tick)
  }
  function start() {
    wanted = true
    if (running || document.hidden || contextLost) return
    if (!motion) { render(); return }
    running = true
    last = sampleStart = performance.now()
    samples = 0
    raf = requestAnimationFrame(tick)
  }
  function pause() {
    running = false
    cancelAnimationFrame(raf)
  }
  function stop() { wanted = false; pause() }
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1
    // The boat shares this framebuffer: render fine edges at device resolution
    // instead of enlarging the former 600k-pixel canvas across the entire hero.
    const pixelBudget = options.coarse ? 1800000 : 3600000
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(pixelBudget/(w*h)))
    renderer.setPixelRatio(ratio)
    renderer.setSize(w,h,false)
    renderer.getDrawingBufferSize(uniforms.uResolution.value)
    camera.aspect = w/h
    uniforms.uAspect.value = camera.aspect
    camera.fov = w/h < 1 ? 60 : 42
    camera.updateProjectionMatrix()
    const spread = 2*Math.tan(camera.fov*Math.PI/360)*camera.aspect*1.18
    for (let i=0; i<positions.count; i++) {
      const depth = Math.pow(grid.getY(i),1.85)*124
      positions.setXYZ(i,(grid.getX(i)-.5)*(10+depth*spread),0,2-depth)
    }
    positions.needsUpdate = true
    if (!running) render()
  }
  const ocean: Ocean = {
    scene,camera,renderer,uniforms,onFrame: null,onDispose: null,
    get time() { return time }, get running() { return running },
    get disposed() { return disposed },
    setScroll(progress) {
      const smooth = (start: number, end: number) => {
        const t = Math.max(0, Math.min(1, (progress-start)/(end-start)))
        return t*t*(3-2*t)
      }
      uniforms.uBoatOpacity.value = 1-smooth(.03,.3)
      // Keep the hero's deliberate pace, then settle the continuing background to
      // a calmer 0.8× speed once the boat has faded from the first viewport.
      scrollSpeed = 1-smooth(.3,.9)*.2
      const atmosphere = smooth(.3,.9)
      container.style.setProperty('--hero-blur', `${(atmosphere*6.5).toFixed(2)}px`)
      container.style.setProperty('--hero-brightness', `${(1-atmosphere*.62).toFixed(3)}`)
      if (!running && !document.hidden) render()
    },
    // Normalized hero coordinates. Negative values let the light leave without
    // teleporting its soft falloff to a corner of the scene.
    setPointer(x,y,strength = 1) {
      pointerStrengthTarget = x >= 0 && y >= 0 ? Math.max(0,Math.min(1,strength)) : 0
      if (pointerStrengthTarget) {
        pointerTarget.set(x,1-y)
        if (!options.reducedMotion) cameraDriftTarget.set((x-.5)*2*pointerStrengthTarget,(.5-y)*2*pointerStrengthTarget)
      } else {
        cameraDriftTarget.set(0,0)
      }
      // Paused and reduced-motion scenes still respond, without starting the sea.
      if (!running) {
        pointer.copy(pointerTarget)
        pointerStrength = pointerStrengthTarget
        uniforms.uPointer.value.copy(pointer)
        uniforms.uPointerStrength.value = pointerStrength
        if (!document.hidden) render()
      }
    },
    setMotion(enabled) {
      motion = enabled
      if (enabled && wanted) start()
      else if (!enabled) { pause(); render() }
    },
    start,stop,renderOnce: () => render(),
    dispose() {
      disposed = true
      stop(); ro.disconnect()
      ocean.onDispose?.(); ocean.onDispose = null; ocean.onFrame = null
      document.removeEventListener('visibilitychange',onVisibility)
      canvas.removeEventListener('webglcontextlost',onLost)
      canvas.removeEventListener('webglcontextrestored',onRestored)
      geometry.dispose(); detail.dispose(); material.dispose(); renderer.dispose(); canvas.remove()
      fogGeometry.dispose(); fogMaterial.dispose()
    },
  }
  const onVisibility = () => { if (document.hidden) pause(); else if (wanted) start() }
  const onLost = (event: Event) => { event.preventDefault(); contextLost = true; pause(); canvas.style.visibility = 'hidden' }
  const onRestored = () => { contextLost = false; canvas.style.visibility = ''; if (wanted) start(); else render() }
  document.addEventListener('visibilitychange',onVisibility)
  canvas.addEventListener('webglcontextlost',onLost)
  canvas.addEventListener('webglcontextrestored',onRestored)
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()
  return ocean
}
