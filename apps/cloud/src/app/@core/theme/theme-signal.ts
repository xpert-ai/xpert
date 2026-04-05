import { computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Store } from '@metad/cloud/state'
import { normalizeTheme, prefersColorScheme, resolveTheme } from '@metad/ocap-angular/core'

/**
 * Injects a computed signal that resolves the application theme
 * (preferred + system) into `{ preferredTheme, primary }`.
 */
export function injectTheme() {
  const store = inject(Store)
  const preferredTheme$ = toSignal(store.preferredTheme$)
  const systemTheme$ = toSignal(prefersColorScheme(), { requireSync: true })

  return computed(() => {
    const preferredTheme = normalizeTheme(preferredTheme$())
    const systemTheme = systemTheme$()
    const primary = resolveTheme(preferredTheme, systemTheme)
    return { preferredTheme, primary }
  })
}

/**
 * Injects a computed signal that returns the Monaco editor theme ('vs' or 'vs-dark').
 */
export function injectEditorTheme() {
  const theme = injectTheme()
  return computed(() => (theme().primary?.startsWith('dark') ? 'vs-dark' : 'vs'))
}
