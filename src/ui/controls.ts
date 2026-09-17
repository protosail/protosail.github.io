/**
 * The three things you can actually do: point the wind somewhere, deflect the trim tab,
 * put the rudder over.
 *
 * These are real controls — a slider role with keyboard support on the dial, native
 * range inputs for the servos — because "drag this" is the whole argument the page is
 * making and it shouldn't be mouse-only. Every interaction drops AUTO, and AUTO puts it
 * back; nothing here writes a joint angle directly, it all goes through the simulation.
 */

import type { Sim, SimState } from '../viewer/sim.js'
import { JOINTS } from '../config/joints.js'

export interface ControlPanel {
  readonly element: HTMLElement
  sync(state: SimState): void
  setFocus(control: 'wind' | 'tab' | 'rudder' | undefined): void
  dispose(): void
}

const TAB_LIMIT = JOINTS.tail.limitDeg ?? 30
const RUDDER_LIMIT = JOINTS.rudder.limitDeg ?? 35

// Round before wrapping, or 359.7° prints as "360".
const bearing = (deg: number) => String(((Math.round(deg) % 360) + 360) % 360).padStart(3, '0')
const signed = (deg: number) => `${deg > 0.05 ? '+' : deg < -0.05 ? '−' : ''}${Math.abs(deg).toFixed(0)}°`

export function createControls(sim: Sim): ControlPanel {
  const element = document.createElement('section')
  element.className = 'controls'
  element.innerHTML = `
    <div class="controls-head">
      <h2 class="controls-title">Trim</h2>
      <button type="button" class="auto" aria-pressed="true">Auto</button>
    </div>
    <div class="controls-body">
      <div class="dial" role="slider" tabindex="0"
           aria-label="Apparent wind direction, relative to the bow"
           aria-valuemin="-180" aria-valuemax="180" aria-valuenow="0">
        <svg viewBox="-50 -50 100 100" aria-hidden="true">
          <circle class="dial-ring" cx="0" cy="0" r="41" />
          <g class="dial-ticks">
            <line x1="0" y1="-41" x2="0" y2="-34" />
            <line x1="41" y1="0" x2="35" y2="0" />
            <line x1="0" y1="41" x2="0" y2="35" />
            <line x1="-41" y1="0" x2="-35" y2="0" />
          </g>
          <!-- the boat, bow up -->
          <path class="dial-boat" d="M0-21c4.2 0 7 8.4 7 21s-2.8 21-7 21-7-8.4-7-21S-4.2-21 0-21z" />
          <g class="dial-needle">
            <path class="dial-arrow" d="M0-46 6-34 0-38-6-34z" />
            <line class="dial-stem" x1="0" y1="-33" x2="0" y2="-24" />
          </g>
        </svg>
        <span class="dial-value">000&deg;</span>
      </div>
      <div class="sliders">
        <div class="slider" data-control="tab">
          <label class="slider-label" for="ctl-tab">Trim tab</label>
          <input id="ctl-tab" type="range" min="${-TAB_LIMIT}" max="${TAB_LIMIT}" step="0.5" value="0" />
          <output class="slider-value" for="ctl-tab">0&deg;</output>
        </div>
        <div class="slider" data-control="rudder">
          <label class="slider-label" for="ctl-rudder">Rudder</label>
          <input id="ctl-rudder" type="range" min="${-RUDDER_LIMIT}" max="${RUDDER_LIMIT}" step="0.5" value="0" />
          <output class="slider-value" for="ctl-rudder">0&deg;</output>
        </div>
      </div>
    </div>
  `

  const auto = element.querySelector('.auto') as HTMLButtonElement
  const dial = element.querySelector('.dial') as HTMLElement
  const needle = element.querySelector('.dial-needle') as SVGGElement
  const dialValue = element.querySelector('.dial-value') as HTMLElement
  const tab = element.querySelector('#ctl-tab') as HTMLInputElement
  const rudder = element.querySelector('#ctl-rudder') as HTMLInputElement
  const tabOut = element.querySelector('[for="ctl-tab"].slider-value') as HTMLOutputElement
  const rudderOut = element.querySelector('[for="ctl-rudder"].slider-value') as HTMLOutputElement
  const slider = (name: string) => element.querySelector(`.slider[data-control="${name}"]`) as HTMLElement

  /**
   * Taking manual control has to be seamless: seed the inputs from wherever the
   * simulation currently is, so nothing snaps when AUTO drops out.
   */
  function takeControl() {
    if (!sim.inputs.auto) return
    sim.set({
      auto: false,
      windDeg: sim.state.windDeg,
      tabDeg: sim.state.tabDeg,
      rudderDeg: sim.state.rudderDeg,
    })
    auto.setAttribute('aria-pressed', 'false')
  }

  auto.addEventListener('click', () => {
    const next = !sim.inputs.auto
    sim.set({ auto: next })
    auto.setAttribute('aria-pressed', String(next))
  })

  // --- dial ----------------------------------------------------------------
  // Screen angle and wind angle are the same number: at 0 the arrow is at the top and
  // the wind is on the nose, and both grow clockwise when seen from above.
  function angleFromPointer(event: PointerEvent): number {
    const rect = dial.getBoundingClientRect()
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    if (Math.hypot(dx, dy) < 6) return sim.inputs.windDeg
    return (Math.atan2(dx, -dy) * 180) / Math.PI
  }

  let dragging = false
  const onPointerDown = (event: PointerEvent) => {
    dragging = true
    dial.setPointerCapture(event.pointerId)
    takeControl()
    sim.set({ windDeg: angleFromPointer(event) })
    event.preventDefault()
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return
    sim.set({ windDeg: angleFromPointer(event) })
  }
  const onPointerUp = (event: PointerEvent) => {
    dragging = false
    if (dial.hasPointerCapture(event.pointerId)) dial.releasePointerCapture(event.pointerId)
  }
  dial.addEventListener('pointerdown', onPointerDown)
  dial.addEventListener('pointermove', onPointerMove)
  dial.addEventListener('pointerup', onPointerUp)
  dial.addEventListener('pointercancel', onPointerUp)

  const onDialKey = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 1 : 5
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = sim.state.windDeg + step
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = sim.state.windDeg - step
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = 180
    if (next === null) return
    event.preventDefault()
    takeControl()
    sim.set({ windDeg: next })
  }
  dial.addEventListener('keydown', onDialKey)

  // --- servos --------------------------------------------------------------
  const onTab = () => {
    takeControl()
    sim.set({ tabDeg: Number(tab.value) })
  }
  const onRudder = () => {
    takeControl()
    sim.set({ rudderDeg: Number(rudder.value) })
  }
  tab.addEventListener('input', onTab)
  rudder.addEventListener('input', onRudder)

  // --- reflection ----------------------------------------------------------
  // Infinity, not NaN: every comparison against NaN is false, so a NaN seed would make
  // the "has this changed enough to redraw?" test fail forever and the panel would sit
  // at zero while the simulation ran on without it.
  let lastWind = Infinity
  let lastTab = Infinity
  let lastRudder = Infinity
  let lastAuto: boolean | null = null

  return {
    element,

    sync(state) {
      if (Math.abs(state.windDeg - lastWind) > 0.15) {
        lastWind = state.windDeg
        needle.setAttribute('transform', `rotate(${state.windDeg.toFixed(1)})`)
        dialValue.textContent = `${bearing(state.windDeg)}°`
        dial.setAttribute('aria-valuenow', state.windDeg.toFixed(0))
        dial.setAttribute('aria-valuetext', `${bearing(state.windDeg)} degrees off the bow`)
      }
      if (Math.abs(state.tabDeg - lastTab) > 0.15) {
        lastTab = state.tabDeg
        if (!tab.matches(':active')) tab.value = state.tabDeg.toFixed(1)
        tabOut.textContent = signed(state.tabDeg)
      }
      if (Math.abs(state.rudderDeg - lastRudder) > 0.15) {
        lastRudder = state.rudderDeg
        if (!rudder.matches(':active')) rudder.value = state.rudderDeg.toFixed(1)
        rudderOut.textContent = signed(state.rudderDeg)
      }
      if (state.auto !== lastAuto) {
        lastAuto = state.auto
        auto.setAttribute('aria-pressed', String(state.auto))
        element.classList.toggle('is-auto', state.auto)
      }
    },

    setFocus(control) {
      dial.classList.toggle('is-focus', control === 'wind')
      slider('tab').classList.toggle('is-focus', control === 'tab')
      slider('rudder').classList.toggle('is-focus', control === 'rudder')
    },

    dispose() {
      dial.removeEventListener('pointerdown', onPointerDown)
      dial.removeEventListener('pointermove', onPointerMove)
      dial.removeEventListener('pointerup', onPointerUp)
      dial.removeEventListener('pointercancel', onPointerUp)
      dial.removeEventListener('keydown', onDialKey)
      tab.removeEventListener('input', onTab)
      rudder.removeEventListener('input', onRudder)
      element.remove()
    },
  }
}
