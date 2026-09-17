import { qsa } from '../lib/dom.js'
import { gsap, instant } from '../lib/scroll.js'

/** One quiet entrance per content block. Content remains readable without JS. */
export function initReveals(): void {
  if (instant) return
  gsap.from('[data-hero-line]', {
    opacity: 0, y: 14, duration: .65, stagger: .07, ease: 'power2.out', clearProps: 'all',
  })
  for (const el of qsa('[data-reveal], [data-split], [data-reveal-group]')) {
    gsap.from(el, {
      opacity: 0, y: 10, duration: .45, ease: 'power2.out', clearProps: 'all',
      scrollTrigger: { trigger: el, start: 'top 95%', once: true },
    })
  }
}
