import { qs } from '../lib/dom.js'
import { ScrollTrigger, coarsePointer, reducedMotion } from '../lib/scroll.js'
import { whenVisible } from '../lib/visibility.js'
import { createOcean, type Ocean } from './ocean.js'
import { mountGhostBoat } from './ghostBoat.js'

export function initHero(): Ocean | null {
  if (new URLSearchParams(location.search).has('nohero')) return null
  const hero = qs('.hero')
  const main = qs('#main')
  const backdrop = qs('[data-hero-backdrop]')
  const sizeBackdrop = () => backdrop.style.setProperty('--hero-scene-height', `${hero.offsetHeight}px`)
  sizeBackdrop()
  backdrop.classList.add('is-ready')
  let ocean: Ocean
  try {
    if (new URLSearchParams(location.search).get('graphics') === 'off') throw new Error('Graphics disabled for fallback preview')
    ocean = createOcean(qs('[data-ocean]'), { reducedMotion, coarse: coarsePointer })
  } catch (error) {
    backdrop.classList.remove('is-ready')
    console.warn('hero: WebGL unavailable', error)
    return null
  }
  void mountGhostBoat(ocean, qs('.hero__body')).catch(error => {
    console.warn('hero: boat unavailable', error)
  })
  let pointerActive = false
  let pointerX = 0, pointerY = 0
  const flareMotion = !reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const resetHeroPointer = () => {
    hero.style.setProperty('--hero-light-strength','0')
    backdrop.style.setProperty('--hero-camera-x','0px')
    backdrop.style.setProperty('--hero-camera-y','0px')
    backdrop.style.setProperty('--hero-camera-rx','0deg')
    backdrop.style.setProperty('--hero-camera-ry','0deg')
  }
  const updatePointer = () => {
    if (!pointerActive) return
    const heroRect = hero.getBoundingClientRect()
    const backdropRect = backdrop.getBoundingClientRect()
    const inHero = pointerX >= heroRect.left && pointerX <= heroRect.right &&
      pointerY >= heroRect.top && pointerY <= heroRect.bottom
    const sceneX = Math.max(0,Math.min(1,(pointerX-backdropRect.left)/backdropRect.width))
    const sceneY = Math.max(0,Math.min(1,(pointerY-backdropRect.top)/backdropRect.height))
    if (inHero) {
      const heroX = Math.max(0,Math.min(heroRect.width,pointerX-heroRect.left))
      const heroY = Math.max(0,Math.min(heroRect.height,pointerY-heroRect.top))
      hero.style.setProperty('--hero-light-x',`${heroX}px`)
      hero.style.setProperty('--hero-light-y',`${heroY}px`)
      hero.style.setProperty('--hero-light-strength','1')
    } else {
      resetHeroPointer()
    }
    if (!reducedMotion && inHero) {
      const cameraX = (sceneX-.5)*2
      const cameraY = (sceneY-.5)*2
      backdrop.style.setProperty('--hero-camera-x',`${(-cameraX*12).toFixed(2)}px`)
      backdrop.style.setProperty('--hero-camera-y',`${(-cameraY*7).toFixed(2)}px`)
      backdrop.style.setProperty('--hero-camera-rx',`${(-cameraY*.5).toFixed(3)}deg`)
      backdrop.style.setProperty('--hero-camera-ry',`${(cameraX*.85).toFixed(3)}deg`)
      if (flareMotion) {
        // Lens angle shifts focus and separates the round optical reflections.
        // Position-driven variation settles at rest, without an idle animation loop.
        const edge = Math.hypot(cameraX,cameraY)/Math.SQRT2
        const focus = .5+.5*Math.sin(cameraX*2.2+cameraY*1.6)
        const scale = .98+edge*.06
        hero.style.setProperty('--hero-flare-rotation',`${(cameraX*9-cameraY*5).toFixed(2)}deg`)
        hero.style.setProperty('--hero-flare-scale-x',(scale+cameraX*.035).toFixed(4))
        hero.style.setProperty('--hero-flare-scale-y',(scale+cameraY*.025).toFixed(4))
        hero.style.setProperty('--hero-flare-drift-x',`${(cameraX*18).toFixed(2)}px`)
        hero.style.setProperty('--hero-flare-drift-y',`${(cameraY*14).toFixed(2)}px`)
        hero.style.setProperty('--hero-flare-halo-size',`${(94+focus*12).toFixed(2)}%`)
        hero.style.setProperty('--hero-flare-ghost-size',`${(108-focus*16).toFixed(2)}%`)
        hero.style.setProperty('--hero-flare-far-size',`${(92+edge*12).toFixed(2)}%`)
        hero.style.setProperty('--hero-flare-blur',`${(2.5+edge*.7+focus*.5).toFixed(2)}px`)
        hero.style.setProperty('--hero-flare-gain',(.82+focus*.18).toFixed(3))
      }
    }
    ocean.setPointer(sceneX,sceneY,inHero ? 1 : .9)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return
    pointerActive = true
    pointerX = event.clientX
    pointerY = event.clientY
    updatePointer()
  }
  const onPointerLeave = () => {
    pointerActive = false
    resetHeroPointer()
    ocean.setPointer(-1,-1)
  }
  if (!coarsePointer) {
    main.addEventListener('pointermove',onPointerMove,{ passive: true })
    main.addEventListener('pointerleave',onPointerLeave)
  }
  const updateOffset = () => {
    // Let the lower part of a tall mobile hero enter view before fading its boat.
    const offset = Math.min(Math.max(0, -hero.getBoundingClientRect().top), Math.max(0, hero.offsetHeight - window.innerHeight))
    backdrop.style.setProperty('--hero-scene-offset', `${-offset}px`)
    updatePointer()
  }
  const update = (progress: number) => {
    ocean.setScroll(progress)
    updateOffset()
  }
  const transition = ScrollTrigger.create({
    trigger: hero,
    start: () => `top+=${Math.max(0, hero.offsetHeight - window.innerHeight)} top`,
    end: 'bottom top',
    onUpdate: self => update(self.progress),
    onRefresh: self => { sizeBackdrop(); update(self.progress) },
  })
  // The atmosphere remains behind the following sections, so keep its clock alive.
  const visibility = whenVisible(qs('#main'), { onEnter: () => ocean.start(), onLeave: () => ocean.stop() })
  window.addEventListener('scroll', updateOffset, { passive: true })
  update(transition.progress)
  const toggle = qs<HTMLButtonElement>('[data-wave-toggle]')
  const toggleLabel = qs<HTMLElement>('.hero__motion-label', toggle)
  let playing = !reducedMotion
  const reflect = () => {
    toggleLabel.textContent = playing ? 'Pause animation' : 'Play animation'
    toggle.title = playing ? 'Pause animation' : 'Play animation'
    toggle.setAttribute('aria-pressed', String(playing))
  }
  toggle.hidden = false
  reflect()
  const onToggle = () => {
    playing = !playing
    ocean.setMotion(playing)
    reflect()
  }
  toggle.addEventListener('click', onToggle)
  const disposeScene = ocean.dispose.bind(ocean)
  ocean.dispose = () => {
    transition.kill()
    visibility.disconnect()
    window.removeEventListener('scroll', updateOffset)
    main.removeEventListener('pointermove',onPointerMove)
    main.removeEventListener('pointerleave',onPointerLeave)
    toggle.removeEventListener('click', onToggle)
    toggle.hidden = true
    backdrop.classList.remove('is-ready')
    disposeScene()
  }
  return ocean
}
