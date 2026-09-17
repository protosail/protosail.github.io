/**
 * A deliberately small WebGL fallback for devices that cannot start the ocean shader.
 * It reuses the production boat geometry but avoids the ocean's render targets and
 * post-processing, so a constrained GPU still has a useful first-screen experience.
 */

import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { createGhostMaterial } from '../viewer/materials.js'
import { fetchModel } from '../viewer/model.js'

export async function mountFallbackBoat(hero: HTMLElement): Promise<void> {
  const host = document.createElement('div')
  host.className = 'hero__model-fallback'
  host.setAttribute('aria-hidden', 'true')
  hero.prepend(host)

  let renderer: WebGLRenderer | null = null
  let frame = 0
  let disposed = false
  let visible = !document.hidden

  try {
    renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
      stencil: false,
    })
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const camera = new PerspectiveCamera(34, 1, 0.08, 60)
    camera.position.set(-2.05, 1.24, 2.28)
    camera.lookAt(0, 0, 0)
    scene.add(new AmbientLight('#6f8896', 1.1))
    const key = new DirectionalLight('#f4fff4', 1.65)
    key.position.set(-2.6, 4.2, 3)
    scene.add(key)

    const { rest } = await fetchModel()
    if (disposed) return

    const material = createGhostMaterial(0xe3f941, 0.88, { body: 0.34 })
    const boat = new Group()
    boat.rotation.order = 'YXZ'
    for (const { geometry, matrixWorld } of rest) {
      const mesh = new Mesh(geometry, material)
      mesh.matrixAutoUpdate = false
      mesh.matrix.copy(matrixWorld)
      mesh.frustumCulled = false
      boat.add(mesh)
    }
    scene.add(boat)

    const coarse = window.matchMedia('(pointer: coarse)').matches
    const resize = () => {
      const width = host.clientWidth || 1
      const height = host.clientHeight || 1
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5))
      renderer!.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      // Keep the full vessel legible behind the copy on portrait tablets; it should
      // read as the fallback scene, not compete with the first-screen message.
      boat.scale.setScalar(camera.aspect < 0.9 ? 0.56 : 0.9)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const startedAt = performance.now()
    const draw = (now: number) => {
      if (disposed) return
      if (visible) {
        boat.rotation.y = -0.48 + (now - startedAt) * 0.00016
        renderer!.render(scene, camera)
      }
      frame = requestAnimationFrame(draw)
    }
    const onVisibility = () => { visible = !document.hidden }
    document.addEventListener('visibilitychange', onVisibility)
    frame = requestAnimationFrame(draw)

    hero.classList.add('hero--model-fallback')
    return
  } catch (error) {
    cancelAnimationFrame(frame)
    renderer?.dispose()
    host.remove()
    throw error
  }
}
