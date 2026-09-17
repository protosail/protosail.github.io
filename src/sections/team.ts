import { qsa } from '../lib/dom.js'

/** Small, independent photo carousels inside each profile card. */
export function initTeamCards(): void {
  for (const gallery of qsa<HTMLElement>('[data-profile-gallery]')) {
    const slides = qsa<HTMLElement>('[data-profile-slide]', gallery)
    const count = gallery.querySelector<HTMLElement>('[data-profile-count]')
    const previous = gallery.querySelector<HTMLButtonElement>('[data-profile-prev]')
    const next = gallery.querySelector<HTMLButtonElement>('[data-profile-next]')
    if (!slides.length || !count || !previous || !next) continue

    let active = 0

    const show = (index: number) => {
      active = (index + slides.length) % slides.length
      slides.forEach((slide, i) => {
        const isActive = i === active
        slide.classList.toggle('is-active', isActive)
        slide.setAttribute('aria-hidden', String(!isActive))
      })
      count.textContent = `${String(active + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`
    }

    previous.addEventListener('click', () => show(active - 1))
    next.addEventListener('click', () => show(active + 1))
  }
}
