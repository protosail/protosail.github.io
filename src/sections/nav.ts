/**
 * The fixed navigation tracks the section in view and opens a scrollable mobile menu.
 */

import { qs, qsa } from '../lib/dom.js'
import { ScrollTrigger, lenis, scrollY } from '../lib/scroll.js'

const SCROLLED_ON = 32
const SCROLLED_OFF = 8
const MOBILE_NAV_QUERY = '(max-width: 859px)'
const HIDE_AFTER_DOWNWARD_SCROLL = 32
const SHOW_AFTER_UPWARD_SCROLL = 24

export function initNav(): void {
  const nav = qs('[data-nav]')
  const links = qsa<HTMLAnchorElement>('[data-nav-links] a, [data-nav-mobile-links] a')
  const toggle = qs<HTMLButtonElement>('[data-nav-toggle]')
  const toggleLabel = qs('[data-nav-toggle-label]')
  const brand = qs<HTMLAnchorElement>('.nav__brand')
  const menu = qs('[data-nav-menu]')
  const background = qsa('body > :not(header):not(script)')
  const previousInert = new Map<HTMLElement, boolean>()
  let previousOverflow = ''
  let open = false

  // On phones the header makes room for the content while reading, then returns on
  // a deliberate upward nudge. The menu itself always takes precedence.
  const mobileNav = window.matchMedia(MOBILE_NAV_QUERY)
  let mobileHidden = false
  let lastScrollY = scrollY()
  let downwardDistance = 0
  let upwardDistance = 0
  function setMobileHidden(next: boolean) {
    if (next === mobileHidden) return
    mobileHidden = next
    nav.classList.toggle('is-mobile-hidden', next)
    nav.inert = next
  }
  function resetMobileHide(y: number) {
    lastScrollY = y
    downwardDistance = 0
    upwardDistance = 0
    setMobileHidden(false)
  }

  // --- scrolled state, with hysteresis so it never flickers around the threshold ----
  let scrolled = false
  function onScroll(y: number) {
    if (!scrolled && y > SCROLLED_ON) {
      scrolled = true
      nav.classList.add('is-scrolled')
    } else if (scrolled && y < SCROLLED_OFF) {
      scrolled = false
      nav.classList.remove('is-scrolled')
    }

    if (!mobileNav.matches || open) {
      resetMobileHide(y)
      return
    }
    if (y <= SCROLLED_OFF) {
      resetMobileHide(y)
      return
    }

    const delta = y - lastScrollY
    lastScrollY = y
    if (delta > 0) {
      downwardDistance += delta
      upwardDistance = 0
      if (downwardDistance >= HIDE_AFTER_DOWNWARD_SCROLL) setMobileHidden(true)
    } else if (delta < 0) {
      upwardDistance -= delta
      downwardDistance = 0
      if (upwardDistance >= SHOW_AFTER_UPWARD_SCROLL) setMobileHidden(false)
    }
  }
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: () => onScroll(scrollY()) })
  onScroll(scrollY())
  mobileNav.addEventListener('change', () => resetMobileHide(scrollY()))

  // --- active section ---------------------------------------------------------------
  function setActive(id: string | null) {
    for (const link of links) {
      if (id && link.hash === `#${id}`) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }
  for (const link of qsa<HTMLAnchorElement>('[data-nav-links] a')) {
    const section = document.querySelector<HTMLElement>(link.hash)
    if (!section) continue
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (self.isActive) setActive(section.id)
      },
    })
  }
  ScrollTrigger.create({
    trigger: '#top',
    start: 'top top',
    end: 'bottom 50%',
    onToggle: (self) => {
      if (self.isActive) setActive(null)
    },
  })

  // --- mobile menu ------------------------------------------------------------------
  function setOpen(next: boolean, restoreFocus = true) {
    if (next === open) return
    open = next
    resetMobileHide(scrollY())
    toggle.setAttribute('aria-expanded', String(next))
    toggleLabel.textContent = next ? 'Close' : 'Menu'
    nav.classList.toggle('is-open', next)
    if (next) {
      menu.hidden = false
      menu.inert = false
      previousOverflow = document.body.style.overflow
      for (const element of [...background, brand]) {
        previousInert.set(element, element.inert)
        element.inert = true
      }
      // Two frames: one for `hidden` to take effect, one for the transition to start.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!open) return
        menu.classList.add('is-open')
        menu.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true })
      }))
      document.body.style.overflow = 'hidden'
      lenis?.stop()
    } else {
      menu.classList.remove('is-open')
      menu.inert = true
      for (const [element, inert] of previousInert) element.inert = inert
      previousInert.clear()
      if (restoreFocus) toggle.focus({ preventScroll: true })
      document.body.style.overflow = previousOverflow
      lenis?.start()
      window.setTimeout(() => {
        if (!open) menu.hidden = true
      }, 320)
    }
  }

  toggle.addEventListener('click', () => setOpen(!open))
  for (const link of qsa<HTMLAnchorElement>('a', menu)) {
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      setOpen(false, false)
      const target = document.querySelector<HTMLElement>(link.hash)
      if (target) {
        const previousTabIndex = target.getAttribute('tabindex')
        target.setAttribute('tabindex', '-1')
        target.focus({ preventScroll: true })
        target.addEventListener('blur', () => {
          if (previousTabIndex === null) target.removeAttribute('tabindex')
          else target.setAttribute('tabindex', previousTabIndex)
        }, { once: true })
      }
    })
  }
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) setOpen(false)
    if (event.key === 'Tab' && open) {
      const items = [toggle, ...qsa<HTMLAnchorElement>('a', menu)]
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  })
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches && open) {
      setOpen(false, false)
      brand.focus({ preventScroll: true })
    }
  })
}
