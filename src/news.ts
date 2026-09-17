import './styles/index.css'

import { news } from './content.js'
import { html, qs, setHtml } from './lib/dom.js'
import { newsStory } from './sections/render.js'

setHtml(
  qs('[data-news-index]'),
  html`${news.map((story) => html`<li>${newsStory(story)}</li>`)}`,
)
