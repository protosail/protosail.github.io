/** IntersectionObserver wrappers for starting and stopping work that is off-screen. */

export interface VisibilityOptions {
  rootMargin?: string
  threshold?: number
  onEnter?: () => void
  onLeave?: () => void
}

export interface Visibility {
  readonly visible: boolean
  disconnect(): void
}

export function whenVisible(el: Element, options: VisibilityOptions = {}): Visibility {
  let visible = false
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      if (entry.isIntersecting === visible) return
      visible = entry.isIntersecting
      ;(visible ? options.onEnter : options.onLeave)?.()
    },
    { rootMargin: options.rootMargin ?? '0px', threshold: options.threshold ?? 0 },
  )
  io.observe(el)
  return {
    get visible() {
      return visible
    },
    disconnect: () => io.disconnect(),
  }
}

/** Runs `fn` the first time `el` comes within `rootMargin` of the viewport, then stops watching. */
export function onceNear(el: Element, rootMargin: string, fn: () => void): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      fn()
    },
    { rootMargin },
  )
  io.observe(el)
  return () => io.disconnect()
}
