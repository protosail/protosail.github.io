/**
 * Drives the loading bar that ships in index.html, so something is on screen before the
 * model has arrived. The markup lives inside `root` (a `.loader` element with a
 * `.loader-bar` and a `.loader-note`).
 */

export interface Loader {
  progress(fraction: number): void
  fail(message: string): void
  done(): Promise<void>
}

export function createLoader(root: HTMLElement): Loader {
  const bar = root.querySelector<HTMLElement>('.loader-bar')
  const note = root.querySelector<HTMLElement>('.loader-note')

  let shown = 0

  return {
    progress(fraction) {
      if (!bar) return
      // Never let the bar go backwards — a second request with a known length after an
      // unknown-length one would otherwise make it jump.
      shown = Math.max(shown, Math.min(1, fraction))
      bar.style.transform = `scaleX(${shown.toFixed(3)})`
    },

    fail(message) {
      root.classList.add('is-error')
      if (note) note.textContent = message
    },

    async done() {
      if (bar) bar.style.transform = 'scaleX(1)'
      if (note) note.textContent = 'ready'
      await new Promise((resolve) => setTimeout(resolve, 160))
      root.classList.add('is-done')
      await new Promise((resolve) => setTimeout(resolve, 700))
      root.remove()
    },
  }
}
