import { qsa } from '../lib/dom.js'
import { gsap, instant, SplitText } from '../lib/scroll.js'

const arrive = { duration: .72, ease: 'power3.out', clearProps: 'opacity,transform' } as const

function groupChildren(group: HTMLElement): HTMLElement[] {
  if (group.classList.contains('updates')) {
    return qsa<HTMLElement>(':scope > .update, :scope > .updates__list > li', group)
  }
  return Array.from(group.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
}

/** Visible by default. Only enhance after fonts settle, with one owner per entrance. */
export function initReveals(): void {
  if (instant) return

  void document.fonts.ready.then(() => {
    const media = gsap.matchMedia()
    media.add('(min-width: 0px)', () => {
      document.documentElement.classList.add('motion-ready')
      const pending = new Map<HTMLElement, { animation: gsap.core.Animation; group?: Element }>()
      const entered = new WeakSet<HTMLElement>()
      const splits: SplitText[] = []
      const counts = new Map<HTMLElement, string>()

      // Observe each card, not its entire grid. This also respects the clipping of
      // the horizontally scrolling prototype gallery on phones.
      const onIntersection: IntersectionObserverCallback = entries => {
        const stagger = new Map<Element, number>()
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target as HTMLElement
          const motion = pending.get(element)
          if (!motion) continue
          const index = motion.group ? (stagger.get(motion.group) ?? 0) : 0
          if (motion.group) stagger.set(motion.group, index + 1)
          entered.add(element)
          motion.animation.delay(Math.min(index * .085, .24)).play()
          observer.unobserve(element)
          edgeObserver.unobserve(element)
        }
      }
      const observer = new IntersectionObserver(onIntersection, {
        rootMargin: '0px 0px -80px 0px', threshold: 0,
      })
      // Short footers can never cross an inset trigger at the end of the document.
      const edgeObserver = new IntersectionObserver(onIntersection, { threshold: 0 })

      const queue = (element: HTMLElement, animation: gsap.core.Animation, group?: Element) => {
        pending.set(element, { animation, group })
        // SplitText may reflow on resize. Already-read headings must stay visible.
        if (entered.has(element) || element.getBoundingClientRect().bottom <= 0) {
          entered.add(element)
          animation.progress(1)
        } else {
          const visibility = element.closest('footer') ? edgeObserver : observer
          visibility.observe(element)
        }
      }

      const reveal = (element: HTMLElement, group?: Element) => {
        queue(element, gsap.from(element, { opacity: 0, y: 24, ...arrive, paused: true }), group)
      }

      // Keyboard navigation never waits for an entrance, including nested links.
      const onFocus = (event: FocusEvent) => {
        if (!(event.target instanceof Node)) return
        for (const [element, motion] of pending) {
          if (!element.contains(event.target)) continue
          entered.add(element)
          motion.animation.delay(0).progress(1)
          observer.unobserve(element)
          edgeObserver.unobserve(element)
        }
      }
      document.addEventListener('focusin', onFocus)

      const hero = document.querySelector<HTMLElement>('.hero__inner')
      if (hero) {
        const sequence = gsap.timeline({ defaults: { ...arrive } })
        sequence.from(qsa('[data-hero-line]', hero), {
          opacity: 0, y: 30, clipPath: 'inset(0 0 100% 0)',
          duration: .85, stagger: .13, clearProps: 'opacity,transform,clipPath',
        })
        sequence.from(qsa('[data-reveal]', hero), {
          opacity: 0, y: 16, duration: .6, stagger: .09,
        }, .18)
        pending.set(hero, { animation: sequence })
      }

      // Line masks give titles a legible, deliberate entrance without scrambling
      // characters. Auto-splitting follows font/viewport changes and preserves ARIA.
      for (const heading of qsa<HTMLElement>('[data-split]')) {
        splits.push(SplitText.create(heading, {
          type: 'lines', mask: 'lines', linesClass: 'reveal-line', autoSplit: true,
          onSplit(split) {
            const animation = gsap.from(split.lines, {
              yPercent: 105, opacity: .15, duration: .82, ease: 'power3.out',
              stagger: { amount: Math.min(.24, (split.lines.length - 1) * .09) },
              clearProps: 'opacity,transform', paused: true,
            })
            queue(heading, animation)
            return animation
          },
        }))
      }

      for (const element of qsa<HTMLElement>('[data-reveal]:not(.challenge-timeline)')) {
        if (!element.closest('.hero')) reveal(element)
      }

      for (const group of qsa<HTMLElement>('[data-reveal-group]')) {
        for (const child of groupChildren(group)) reveal(child, group)
      }

      // The record is the focal beat: an actual count-up, alongside the unchanged zero.
      // Read targets from the content rather than baking a second number into JS.
      for (const metric of qsa<HTMLElement>('.challenge__metric')) {
        const number = metric.querySelector<HTMLElement>('.challenge__number')
        const label = metric.querySelector<HTMLElement>('.challenge__metric-label')
        if (!number || !label) continue
        const finalText = number.textContent ?? ''
        const target = Number(finalText)
        if (!Number.isFinite(target)) continue
        counts.set(number, finalText)
        const counter = { value: 0 }
        const sequence = gsap.timeline({ paused: true })
        sequence.from(number, { opacity: 0, y: 26, ...arrive })
        sequence.from(label, { opacity: 0, y: 12, ...arrive, duration: .55 }, .12)
        if (target > 0) {
          number.textContent = '0'
          sequence.to(counter, {
            value: target, duration: 1.75, ease: 'power1.out',
            onUpdate: () => { number.textContent = String(Math.round(counter.value)) },
            onComplete: () => { number.textContent = finalText },
          }, 0)
        }
        queue(metric, sequence, metric.parentElement ?? undefined)
      }

      const globe = document.querySelector<HTMLElement>('.challenge__globe')
      if (globe) {
        queue(globe, gsap.from(globe, {
          opacity: 0, scale: .96, ...arrive, duration: 1, paused: true,
        }))
      }

      // Milestones draw in reading order on desktop and at their own scroll
      // position on mobile, where the timeline becomes a long vertical list.
      const timelineHead = document.querySelector<HTMLElement>('.challenge-timeline__head')
      if (timelineHead) reveal(timelineHead)
      for (const item of qsa<HTMLElement>('.challenge-timeline__item')) {
        gsap.set(item, { '--timeline-draw': 0, '--timeline-node': 0 })
        const sequence = gsap.timeline({ paused: true })
        sequence.to(item, {
          '--timeline-node': 1, '--timeline-draw': 1, duration: .7, ease: 'power2.out',
        })
        sequence.from(qsa('.challenge-timeline__date, .challenge-timeline__body', item), {
          opacity: 0, y: 18, ...arrive, stagger: .08,
        }, .08)
        queue(item, sequence, item.parentElement ?? undefined)
      }

      // Each image and its copy form one short sequence. Never schedule the next
      // mobile card before the visitor has reached it.
      for (const application of qsa<HTMLElement>('.application')) {
        const frame = application.querySelector('.application__figure')
        const body = application.querySelector('.application__body')
        if (!frame || !body) continue
        const sequence = gsap.timeline({ paused: true })
        sequence.from(frame, {
          opacity: .1, clipPath: 'inset(0 0 24% 0)', y: 18,
          ...arrive, duration: .85, clearProps: 'opacity,transform,clipPath',
        })
        sequence.from(body, { opacity: 0, y: 20, ...arrive }, .16)
        queue(application, sequence, application.parentElement ?? undefined)
      }

      // The boat camera still owns its tour; only its text children get entrances.
      for (const copy of qsa<HTMLElement>('.step__copy')) {
        queue(copy, gsap.from(Array.from(copy.children), {
          opacity: 0, y: 20, ...arrive, stagger: .08, paused: true,
        }))
      }

      const newsNav = document.querySelector<HTMLElement>('.news-page__nav-inner')
      if (newsNav) gsap.from(newsNav, { opacity: 0, y: -8, ...arrive, duration: .5 })
      for (const story of qsa<HTMLElement>('.news-page__grid > li')) {
        reveal(story, story.parentElement ?? undefined)
      }

      return () => {
        observer.disconnect()
        edgeObserver.disconnect()
        document.removeEventListener('focusin', onFocus)
        splits.forEach(split => split.revert())
        counts.forEach((value, number) => { number.textContent = value })
        document.documentElement.classList.remove('motion-ready')
      }
    })
  })
}
