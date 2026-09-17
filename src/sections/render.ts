/**
 * Fills the list-shaped parts of the page from src/content.ts: rules,
 * previous boats, the team, and news. Everything here is data in,
 * markup out — no behaviour.
 */

import { boat, news, team, type NewsItem, type PastBoat, type Person } from '../content.js'
import { arrow, html, qs, setHtml, type Raw } from '../lib/dom.js'

function tile(image: string | undefined, alt: string, caption?: Raw): Raw {
  return html`
    <div class="tile">
      <div class="tile__media">${image ? html`<img src="${image}" alt="${alt}" loading="lazy" decoding="async" />` : ''}</div>
      ${image ? '' : html`<span class="tile__index">Image to follow</span>`}
      ${caption}
    </div>
  `
}

function person(p: Person): Raw {
  const name = p.link ? html`<a class="link-plain" href="${p.link}">${p.name}</a>` : p.name
  const photos = p.photos?.length ? p.photos : [undefined, undefined, undefined]
  return html`
    <li class="person"${p.photos?.length ? '' : ' data-placeholder'}>
      <article class="person__card" data-profile-gallery>
        <div class="person__gallery">
          ${photos.map(
            (photo, i) => html`
              <div class="person__slide${i === 0 ? ' is-active' : ''}" data-profile-slide aria-hidden="${i === 0 ? 'false' : 'true'}">
                ${photo
                  ? html`<img src="${photo}" alt="${p.name}, portrait ${i + 1}" loading="lazy" decoding="async" />`
                  : html`
                      <span class="person__placeholder-mark" aria-hidden="true">${p.index}</span>
                      <span class="person__placeholder-label mono">Portrait ${i + 1}</span>
                    `}
              </div>
            `,
          )}
          <div class="person__gallery-controls">
            <button class="person__gallery-btn person__gallery-btn--prev" type="button" data-profile-prev aria-label="Previous photo of ${p.name}">
              ${arrow()}
            </button>
            <span class="person__gallery-count mono" data-profile-count aria-live="polite">01 / ${String(photos.length).padStart(2, '0')}</span>
            <button class="person__gallery-btn" type="button" data-profile-next aria-label="Next photo of ${p.name}">
              ${arrow()}
            </button>
          </div>
        </div>
        <div class="person__content">
          <div class="person__heading">
            <span class="person__index mono">${p.index}</span>
            <h4 class="person__name">${name}</h4>
          </div>
          <p class="person__bio">${p.bio}</p>
        </div>
      </article>
    </li>
  `
}

function pastBoat(b: PastBoat): Raw {
  const caption = html`
    <span class="tile__caption">
      <span class="tile__caption-title">${b.name}</span>
      ${b.note ? html`<span class="tile__caption-note mono">${b.note}</span>` : ''}
    </span>
  `
  return html`
    <li${b.image ? '' : ' data-placeholder'}>
      ${tile(b.image, b.alt ?? b.name, caption)}
    </li>
  `
}

export function newsStory(n: NewsItem, featured = false): Raw {
  return html`
    <article class="update${featured ? ' update--featured' : ''}" data-placeholder>
      <a class="update__link" href="${n.href}" aria-label="${n.title}">
        ${n.image
          ? html`
              <figure class="update__media">
                <img src="${n.image}" alt="${n.imageAlt ?? ''}" loading="lazy" decoding="async" />
              </figure>
            `
          : ''}
        <div class="update__body">
          <time class="update__date mono" datetime="${n.date}">${n.date}</time>
          <h3 class="update__title">${n.title}</h3>
          <p class="update__summary">${n.summary}</p>
          <span class="update__arrow" aria-hidden="true">${arrow()}</span>
        </div>
      </a>
    </article>
  `
}

export function renderContent(): void {
  setHtml(qs('[data-past]'), html`${boat.previous.map(pastBoat)}`)

  setHtml(qs('[data-team="members"]'), html`${team.members.map(person)}`)
  setHtml(qs('[data-team="supervisors"]'), html`${team.supervisors.map(person)}`)
  setHtml(qs('[data-team="alumni"]'), html`${team.alumni.map(person)}`)

  const [featuredNews, ...recentNews] = news
  setHtml(qs('[data-news]'), html`
    ${featuredNews ? newsStory(featuredNews, true) : html`<p class="news__empty">No updates yet.</p>`}
    ${recentNews.length
      ? html`
          <ol class="updates__list">
            ${recentNews.slice(0, 2).map((story) => html`<li>${newsStory(story)}</li>`)}
          </ol>
        `
      : ''}
  `)

}
