import { VIEWS, type ViewDef } from '../config/views.js'
import { boat as content } from '../content.js'
import { html, qs, qsa, setHtml } from '../lib/dom.js'
import { ScrollTrigger, coarsePointer, reducedMotion, scrollToElement } from '../lib/scroll.js'
import { onceNear, whenVisible } from '../lib/visibility.js'
import { createLoader } from '../ui/loader.js'
import { sampleTour } from '../viewer/tour.js'
import type { BoatViewer } from '../viewer/viewer.js'

export interface BoatSection {
  readonly viewer: BoatViewer | null
  readonly chapter: string
}

export function initBoatSection(options: { debug?: boolean } = {}): BoatSection {
  const section = qs('#boat'), stage = qs('[data-stage]'), mount = qs('[data-viewer]')
  const stepsEl = qs('[data-steps]'), railEl = qs('[data-rail]')
  const chapters = content.chapters.map(id => VIEWS.find(v => v.id === id)).filter((v): v is ViewDef => Boolean(v))
  setHtml(stepsEl, html`${chapters.map(view => html`
    <article class="step" id="chapter-${view.id}" data-step="${view.id}" tabindex="-1">
      <div class="step__copy">
        <h3 class="h3">${view.label}</h3>
        <p class="step__body">${view.caption}</p>
        ${view.detail ? html`<p class="step__detail">${view.detail}</p>` : ''}
      </div>
    </article>`)}`)
  setHtml(railEl, html`<ol>${chapters.map(view => html`
    <li><a href="#chapter-${view.id}" data-rail-link="${view.id}">${view.label}</a></li>`)}</ol>`)
  const steps = qsa<HTMLElement>('.step', stepsEl)
  const links = qsa<HTMLAnchorElement>('[data-rail-link]', railEl)
  const mobile = window.matchMedia('(max-width: 859px)')
  let viewer: BoatViewer | null = null
  let current = chapters[0].id
  let progress = 0
  let anchors: number[] = []

  function reflect(index: number) {
    const changed = current !== chapters[index].id
    current = chapters[index].id
    steps.forEach(step => step.classList.toggle('is-active', step.dataset.step === current))
    links.forEach(link => {
      if (link.dataset.railLink === current) link.setAttribute('aria-current', 'step')
      else link.removeAttribute('aria-current')
    })
    if (changed && mobile.matches) {
      const link = links[index]
      railEl.scrollTo({ left: Math.max(0, link.offsetLeft - (railEl.clientWidth - link.clientWidth) / 2), behavior: 'instant' })
    }
  }
  for (const link of links) {
    link.addEventListener('click', event => {
      event.preventDefault()
      const step = steps.find(s => s.id === link.hash.slice(1))
      if (!step) return
      scrollToElement(step, event.detail === 0)
      history.pushState(null, '', link.hash)
      step.focus({ preventScroll: true })
    })
  }
  function measure() {
    const offset = mobile.matches
      ? parseFloat(getComputedStyle(stage).top) + stage.getBoundingClientRect().height
      : 0
    anchors = steps.map(step => step.getBoundingClientRect().top + window.scrollY - offset)
    sync()
  }
  function sync() {
    if (!anchors.length) return
    // The transparent sticky viewer shares the sea background. Clip mobile copy
    // as it passes behind the model instead of hiding it with an opaque stage.
    const occlusion = mobile.matches ? Math.max(0, stage.getBoundingClientRect().bottom - stepsEl.getBoundingClientRect().top) : 0
    stepsEl.style.setProperty('--stage-occlusion', `${occlusion}px`)
    const y = window.scrollY
    let index = 0
    while (index < anchors.length - 1 && y >= anchors[index + 1]) index++
    const span = (anchors[index + 1] ?? anchors[index] + 1) - anchors[index]
    progress = Math.max(0, Math.min(1, (index + Math.max(0, (y - anchors[index]) / span)) / (chapters.length - 1)))
    reflect(sampleTour(progress, chapters.length).active)
    viewer?.setTourProgress(progress)
  }
  ScrollTrigger.create({
    trigger: qs('[data-scrolly]'), start: 'top bottom', end: 'bottom top',
    onUpdate: sync, onRefresh: measure,
  })
  measure()
  const lensShift = () => window.innerWidth >= 1200 ? .18 : window.innerWidth >= 860 ? .16 : 0
  onceNear(section, '75% 0px', async () => {
    const loader = createLoader(qs('[data-loader]'))
    try {
      if (new URLSearchParams(location.search).get('graphics') === 'off') throw new Error('Graphics disabled for fallback preview')
      const { createBoatViewer } = await import('../viewer/viewer.js')
      viewer = await createBoatViewer(mount, {
        onProgress: loader.progress, reducedMotion, debug: options.debug,
        controls: { zoom: false, oneFingerRotate: false },
        cursorParallax: 1.65,
      })
    } catch (error) {
      console.warn('boat: viewer unavailable', error)
      stage.classList.add('is-unavailable')
      loader.fail('The 3D model could not load. You can still read about each component below.')
      return
    }
    const v = viewer
    v.setLensShift(lensShift())
    v.setTourProgress(progress)
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = stage.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      stage.style.setProperty('--boat-light-x', `${(x * 100).toFixed(2)}%`)
      stage.style.setProperty('--boat-light-y', `${(y * 100).toFixed(2)}%`)
      stage.style.setProperty('--boat-light-strength', '1')
      v.setPointer(x, y)
    }
    const onPointerLeave = () => {
      stage.style.setProperty('--boat-light-strength', '0')
      v.setPointer(-1, -1)
    }
    if (!coarsePointer) {
      stage.addEventListener('pointermove', onPointerMove, { passive: true })
      stage.addEventListener('pointerleave', onPointerLeave)
      window.addEventListener('pagehide', () => {
        stage.removeEventListener('pointermove', onPointerMove)
        stage.removeEventListener('pointerleave', onPointerLeave)
      }, { once: true })
    }
    void loader.done()
    whenVisible(stage, { onEnter: () => v.start(), onLeave: () => v.stop() })
    const ro = new ResizeObserver(() => { v.setLensShift(lensShift()); measure() })
    ro.observe(stage)
    ScrollTrigger.refresh()
    const hashTarget = steps.find(step => '#' + step.id === location.hash)
    if (hashTarget) { scrollToElement(hashTarget, true); sync() }
    if (options.debug) Object.assign(window, { viewer: v })
  })
  return { get viewer() { return viewer }, get chapter() { return current } }
}
