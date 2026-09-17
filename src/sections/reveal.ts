import { qsa } from '../lib/dom.js'
import { gsap, instant } from '../lib/scroll.js'

const entrance = { duration: .58, ease: 'power3.out', clearProps: 'all' } as const

function groupChildren(group: HTMLElement): HTMLElement[] {
  if (group.classList.contains('updates')) {
    return qsa<HTMLElement>(':scope > .update, :scope > .updates__list > li', group)
  }
  return Array.from(group.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
}

function cappedStagger(count: number, preferred = .065): number {
  return count > 1 ? Math.min(preferred, .42 / (count - 1)) : 0
}

/**
 * A small, shared motion score for the editorial parts of the site. Content is visible
 * in the default CSS state, so a missing script never makes the page unreadable.
 */
export function initReveals(): void {
  if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  document.documentElement.classList.add('motion-ready')

  const heroLines = qsa<HTMLElement>('[data-hero-line]')
  if (heroLines.length) {
    gsap.from(heroLines, {
      opacity: 0, y: 14, duration: .65, stagger: .07, ease: 'power3.out', clearProps: 'all',
    })
  }

  // Plain copy arrives quickly. Larger structures below get motion that describes
  // their own relationship rather than repeating this treatment everywhere.
  for (const el of qsa<HTMLElement>('[data-reveal]:not(.challenge-timeline)')) {
    gsap.from(el, {
      opacity: 0, y: 8, duration: .42, ease: 'power2.out', clearProps: 'all',
      scrollTrigger: { trigger: el, start: 'top 95%', once: true },
    })
  }

  // Headings rise through a tight crop, echoing a sail clearing the horizon.
  for (const heading of qsa<HTMLElement>('[data-split]')) {
    gsap.from(heading, {
      opacity: .35,
      y: 18,
      clipPath: 'inset(0 0 100% 0)',
      ...entrance,
      scrollTrigger: { trigger: heading, start: 'top 92%', once: true },
    })
  }

  // Related items arrive as a bounded sequence. The cap keeps large team lists from
  // turning into a long reveal queue.
  for (const group of qsa<HTMLElement>('[data-reveal-group]')) {
    const children = groupChildren(group)
    if (!children.length) continue
    const horizontal = group.classList.contains('past__grid')
    gsap.from(children, {
      opacity: 0,
      x: horizontal ? 14 : 0,
      y: horizontal ? 0 : 10,
      duration: .52,
      stagger: cappedStagger(children.length),
      ease: 'power3.out',
      clearProps: 'all',
      scrollTrigger: { trigger: group, start: 'top 91%', once: true },
    })
  }

  const timeline = document.querySelector<HTMLElement>('.challenge-timeline')
  if (timeline) {
    const items = qsa<HTMLElement>('.challenge-timeline__item', timeline)
    const copy = qsa<HTMLElement>('.challenge-timeline__date, .challenge-timeline__body', timeline)
    gsap.set(items, { '--timeline-draw': 0, '--timeline-node': 0 })
    const sequence = gsap.timeline({
      scrollTrigger: { trigger: timeline, start: 'top 82%', once: true },
      defaults: { ease: 'power3.out' },
    })
    sequence.from(timeline.querySelector('.challenge-timeline__head'), {
      opacity: 0, y: 8, duration: .42, clearProps: 'all',
    })
    sequence.to(items, {
      '--timeline-draw': 1,
      '--timeline-node': 1,
      duration: .5,
      stagger: cappedStagger(items.length, .08),
    }, '-=.16')
    sequence.from(copy, {
      opacity: 0,
      y: 8,
      duration: .42,
      stagger: cappedStagger(copy.length, .035),
      clearProps: 'all',
    }, '<+.08')
  }

  const applications = document.querySelector<HTMLElement>('.applications')
  if (applications) {
    const heading = applications.querySelector<HTMLElement>('.applications__head .h2')
    const intro = applications.querySelector<HTMLElement>('.applications__intro')
    const frames = qsa<HTMLElement>('.application__figure', applications)
    const bodies = qsa<HTMLElement>('.application__body', applications)
    const sequence = gsap.timeline({
      scrollTrigger: { trigger: applications, start: 'top 76%', once: true },
      defaults: { ease: 'power3.out' },
    })
    sequence.from([heading, intro].filter(Boolean), {
      opacity: 0, y: 10, duration: .48, stagger: .08, clearProps: 'all',
    })
    sequence.from(frames, {
      opacity: .25,
      clipPath: 'inset(0 0 100% 0)',
      duration: .62,
      stagger: cappedStagger(frames.length, .07),
      clearProps: 'all',
    }, '-=.18')
    sequence.from(bodies, {
      opacity: 0, y: 8, duration: .42, stagger: cappedStagger(bodies.length, .06), clearProps: 'all',
    }, '-=.36')
  }

  const newsPage = document.querySelector<HTMLElement>('.news-page')
  if (newsPage) {
    const heading = qsa<HTMLElement>('.news-page__head > *', newsPage)
    const stories = qsa<HTMLElement>('.news-page__grid > li', newsPage)
    gsap.from('.news-page__nav-inner', {
      opacity: 0, y: -6, duration: .42, ease: 'power2.out', clearProps: 'all',
    })
    gsap.from(heading, {
      opacity: 0, y: 10, duration: .5, stagger: .08, ease: 'power3.out', clearProps: 'all',
    })
    if (stories.length) {
      gsap.from(stories, {
        opacity: 0,
        y: 10,
        duration: .52,
        stagger: cappedStagger(stories.length),
        ease: 'power3.out',
        clearProps: 'all',
        scrollTrigger: { trigger: stories[0], start: 'top 92%', once: true },
      })
    }
  }
}
