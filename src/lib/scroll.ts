/**
 * Scroll plumbing shared by every section: GSAP + ScrollTrigger, the SplitText and
 * DrawSVG plugins, and Lenis for smooth wheel scrolling.
 *
 * Lenis runs in native-scroll mode (it drives window.scrollY), so `position: sticky`
 * and IntersectionObserver keep working and ScrollTrigger needs no scroller proxy. It
 * disables its own smoothing under prefers-reduced-motion; `instant` additionally
 * covers the screenshot harness (`?shots`), where every reveal should land at once.
 *
 * In-page anchors are handled here rather than by Lenis, so that one rule — the
 * target's CSS `scroll-margin-top` — decides where a link lands, whether the scroll is
 * smoothed or native.
 */

import gsap from 'gsap'
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { FLAGS } from '../content.js'

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin)

const params = new URLSearchParams(window.location.search)

// Full motion is the authored default. The URL keeps a deliberate reduced-motion
// path available for visitors, QA and embedded presentations.
export const reducedMotion = params.get('motion') === 'reduce'
document.documentElement.dataset.motion = reducedMotion ? 'reduce' : 'full'
/** No smoothing, no reveals: reduced motion, or the screenshot harness. */
export const instant = reducedMotion || params.has('shots')
// `pointer: coarse` reports the primary input only, so hybrid Windows laptops can
// look touch-only in Edge/Chrome even while a mouse is attached.
export const coarsePointer = !window.matchMedia('(any-pointer: fine)').matches

export let lenis: Lenis | null = null

export function initScroll(): void {
  if (FLAGS.SMOOTH_SCROLL && !instant && !params.has('nosmooth')) {
    lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
      syncTouch: false,
      anchors: false,
      prevent: (node) => node.hasAttribute('data-lenis-prevent'),
    })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => lenis?.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
  }

  ScrollTrigger.config({ ignoreMobileResize: true })
  document.fonts.ready.then(() => ScrollTrigger.refresh())

  document.addEventListener('click', onAnchorClick)
}

function onAnchorClick(event: MouseEvent): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
  if (!link) return
  const id = decodeURIComponent(link.hash.slice(1))
  const target = id ? document.getElementById(id) : null
  if (!target) return
  event.preventDefault()
  scrollToElement(target, event.detail === 0)
  window.history.pushState(null, '', `#${id}`)
}

/** Scrolls so `el` sits at its scroll margin, through Lenis when it is running. */
export function scrollToElement(el: Element, immediate = false): void {
  if (lenis) {
    // Lenis already reads scroll-margin-top, just like native scrollIntoView.
    lenis.scrollTo(el as HTMLElement, { duration: 0.7, immediate })
    return
  }
  el.scrollIntoView({ behavior: instant || immediate ? 'instant' : 'smooth', block: 'start' })
}

/** Current scroll position, from whichever thing owns it. */
export function scrollY(): number {
  return lenis ? lenis.scroll : window.scrollY
}

export { gsap, ScrollTrigger, SplitText }
