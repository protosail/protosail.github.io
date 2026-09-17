/**
 * The instrument readout.
 *
 * Five numbers, refreshed ten times a second rather than sixty: text nodes are the one
 * thing in this page that can force layout, and nobody can read a number changing at
 * 60 Hz anyway.
 */

import type { SimState } from '../viewer/sim.js'

export interface Hud {
  readonly element: HTMLElement
  update(state: SimState, dt: number): void
  dispose(): void
}

const ROWS = [
  { key: 'wind', label: 'Wind', hint: 'apparent, off the bow' },
  { key: 'wing', label: 'Wing', hint: 'heading in the boat’s frame' },
  { key: 'aoa', label: 'α', hint: 'angle of attack the tab is holding' },
  { key: 'tab', label: 'Tab', hint: 'trim tab deflection' },
  { key: 'rudder', label: 'Rudder', hint: 'rudder angle' },
] as const

const INTERVAL = 0.1

// Round before wrapping, or 359.7° prints as "360".
const bearing = (deg: number) => `${String(((Math.round(deg) % 360) + 360) % 360).padStart(3, '0')}°`
const signed = (deg: number) =>
  `${deg > 0.05 ? '+' : deg < -0.05 ? '−' : ' '}${Math.abs(deg).toFixed(1).padStart(4, ' ')}°`

export function createHud(): Hud {
  const element = document.createElement('section')
  element.className = 'hud'
  element.innerHTML =
    `<h2 class="hud-title">Readout</h2><dl class="hud-rows">` +
    ROWS.map(
      (row) =>
        `<div class="hud-row"><dt title="${row.hint}">${row.label}</dt>` +
        `<dd data-key="${row.key}">-</dd></div>`,
    ).join('') +
    `</dl>`

  const cells = Object.fromEntries(
    ROWS.map((row) => [row.key, element.querySelector(`[data-key="${row.key}"]`) as HTMLElement]),
  ) as Record<(typeof ROWS)[number]['key'], HTMLElement>

  let since = INTERVAL
  const last: Record<string, string> = {}

  function write(key: keyof typeof cells, text: string) {
    if (last[key] === text) return
    last[key] = text
    cells[key].textContent = text
  }

  return {
    element,

    update(state, dt) {
      since += dt
      if (since < INTERVAL) return
      since = 0
      write('wind', bearing(state.windDeg))
      write('wing', bearing(state.wingDeg))
      write('aoa', signed(state.aoaDeg))
      write('tab', signed(state.tabDeg))
      write('rudder', signed(state.rudderDeg))
    },

    dispose() {
      element.remove()
    },
  }
}
