/** Small DOM helpers: strict querying and an HTML template tag that escapes by default. */

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)

/** Marks a string as already-safe HTML so `html` will not escape it. */
export class Raw {
  constructor(readonly value: string) {}
}
export const raw = (value: string) => new Raw(value)

/**
 * Tagged template: interpolated values are escaped unless wrapped in raw(); arrays are
 * joined; null/undefined/false render as nothing.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = ''
  strings.forEach((chunk, i) => {
    out += chunk
    if (i < values.length) out += render(values[i])
  })
  return new Raw(out)
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return ''
  if (value instanceof Raw) return value.value
  if (Array.isArray(value)) return value.map(render).join('')
  return esc(value)
}

export function setHtml(el: Element, content: Raw): void {
  el.innerHTML = content.value
}

/** Inline arrow icon used by buttons and links; `dir` rotates it. */
export function arrow(dir: 'right' | 'down' | 'up-right' = 'right'): Raw {
  const rotate = dir === 'down' ? 90 : dir === 'up-right' ? -45 : 0
  return raw(
    `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true"${rotate ? ` style="transform:rotate(${rotate}deg)"` : ''}>` +
      `<path d="M3 8h9M8 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  )
}
