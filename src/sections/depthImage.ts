import { DataTexture, LinearFilter, Mesh, NoToneMapping, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, SRGBColorSpace, Texture, Vector2, WebGLRenderer } from 'three'
import { qs } from '../lib/dom.js'

/** Broad depth regions keep fine lines and texture from turning into ripples. */
function createDepthField(img: HTMLImageElement): DataTexture {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(img, 0, 0, size, size)
  const pixels = context.getImageData(0, 0, size, size).data
  let field = new Float32Array(size * size)
  for (let i = 0; i < field.length; i++) {
    field[i] = Math.max(pixels[i * 4]!, pixels[i * 4 + 1]!, pixels[i * 4 + 2]!) / 255
  }
  // A separate low-frequency field: never resample sharp image edges as depth.
  for (let pass = 0; pass < 6; pass++) {
    const next = new Float32Array(field.length)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        sum += field[Math.max(0, Math.min(size - 1, y + dy)) * size + Math.max(0, Math.min(size - 1, x + dx))]!
      }
      next[y * size + x] = sum / 9
    }
    field = next
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = (y * size + x) * 4
    // Data textures use bottom-up UVs; the source image is top-down.
    const value = Math.round(field[(size - 1 - y) * size + x]! * 255)
    data.set([value, value, value, 255], index)
  }
  const depth = new DataTexture(data, size, size)
  depth.minFilter = depth.magFilter = LinearFilter
  depth.needsUpdate = true
  return depth
}

export function mountDepthImage(container: HTMLElement) {
  const img = qs<HTMLImageElement>('img', container)
  const target = new Vector2()
  let disposed = false
  let visible = false
  let loading = false
  let wake = () => {}
  let cleanup = () => {}
  const observer = new IntersectionObserver(async ([entry]) => {
    visible = Boolean(entry?.isIntersecting)
    if (!visible) return
    wake()
    if (loading) return
    loading = true
    try {
      await img.decode()
      if (disposed) return
      const depthTexture = createDepthField(img)
      const renderer = new WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
      renderer.toneMapping = NoToneMapping
      const texture = new Texture(img)
      texture.colorSpace = SRGBColorSpace
      texture.needsUpdate = true
      const pointer = new Vector2()
      const uniforms = { uImage: { value: texture }, uDepth: { value: depthTexture }, uPointer: { value: pointer }, uCrop: { value: new Vector2(1, 1) } }
      const material = new ShaderMaterial({
        uniforms,
        vertexShader: `varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
        fragmentShader: `uniform sampler2D uImage; uniform sampler2D uDepth;
          uniform vec2 uPointer; uniform vec2 uCrop; varying vec2 vUv;
          void main() {
            // Ten percent overscan keeps the displacement inside the texture at full tilt.
            vec2 base = (vUv - .5) * uCrop * .90 + .5;
            // One continuous displacement avoids iterative edge snapping.
            // Overall camera drift carries the motion; relief adds a smaller offset.
            float depth = texture2D(uDepth, base).r;
            vec2 uv = base + uPointer * uCrop * vec2(.034, .024) * (.55 + .45 * depth);
            gl_FragColor = texture2D(uImage, uv);
            #include <colorspace_fragment>
          }`,
      })
      const geometry = new PlaneGeometry(2, 2)
      const scene = new Scene()
      scene.add(new Mesh(geometry, material))
      const camera = new OrthographicCamera()
      let frame = 0
      let last = 0
      const draw = (now: number) => {
        frame = 0
        const dt = Math.min((now - last) / 1000, .05)
        last = now
        pointer.lerp(target, 1 - Math.exp(-dt / .18))
        renderer.render(scene, camera)
        if (pointer.distanceToSquared(target) > .000001 && visible && !document.hidden) frame = requestAnimationFrame(draw)
      }
      wake = () => {
        if (!frame && visible && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(draw) }
      }
      const resize = () => {
        const { width, height } = container.getBoundingClientRect()
        const aspect = width / height
        const imageAspect = img.naturalWidth / img.naturalHeight
        uniforms.uCrop.value.set(Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect))
        renderer.setSize(width, height, false)
        renderer.render(scene, camera)
      }
      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      renderer.domElement.setAttribute('aria-hidden', 'true')
      container.append(renderer.domElement)
      resize()
      container.classList.add('has-depth-scene')
      const contextLost = (event: Event) => {
        event.preventDefault()
        cancelAnimationFrame(frame)
        frame = 0
        container.classList.remove('has-depth-scene')
      }
      const contextRestored = () => { resize(); container.classList.add('has-depth-scene'); wake() }
      renderer.domElement.addEventListener('webglcontextlost', contextLost)
      renderer.domElement.addEventListener('webglcontextrestored', contextRestored)
      document.addEventListener('visibilitychange', wake)
      cleanup = () => {
        cancelAnimationFrame(frame)
        resizeObserver.disconnect()
        document.removeEventListener('visibilitychange', wake)
        renderer.dispose(); texture.dispose(); depthTexture.dispose(); material.dispose(); geometry.dispose()
        renderer.domElement.remove()
        container.classList.remove('has-depth-scene')
      }
      wake()
    } catch (error) { console.warn('applications: depth effect unavailable', error) }
  }, { rootMargin: '100px' })
  observer.observe(container)
  return {
    setPointer(x: number, y: number) { target.set(x, y); wake() },
    dispose() { disposed = true; observer.disconnect(); cleanup() },
  }
}
