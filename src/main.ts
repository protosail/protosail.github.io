/**
 * Composition root. Each section owns its own behaviour; this file only decides the
 * order things come up in and wires the debug hooks.
 *
 *   ?debug     outlines every placeholder, exposes window.lenis / window.ocean / window.viewer
 *   ?shots     screenshot mode: no smoothing, reveals land instantly
 *   ?nosmooth  native scrolling only
 *   ?nohero    skip the hero WebGL scene
 *   ?motion=reduce  opt into the reduced-motion presentation
 *   ?graphics=off  preview the graphics fallback
 *   ?qa=model-error  exercise model loading failure
 */

import './styles/index.css'

import { initHero } from './hero/hero.js'
import { initScroll, lenis } from './lib/scroll.js'
import { initApplications } from './sections/applications.js'
import { initBoatSection } from './sections/boat.js'
import { initChallenge } from './sections/challenge.js'
import { initNav } from './sections/nav.js'
import { renderContent } from './sections/render.js'
import { initReveals } from './sections/reveal.js'
import { initTeamCards } from './sections/team.js'

const params = new URLSearchParams(window.location.search)
export const DEBUG = params.has('debug')
if (DEBUG) document.documentElement.dataset.debug = ''

renderContent()
initTeamCards()
initScroll()
initNav()
initChallenge()
initBoatSection({ debug: DEBUG })
initApplications()
initReveals()
const ocean = initHero()

if (DEBUG) Object.assign(window, { lenis, ocean })
