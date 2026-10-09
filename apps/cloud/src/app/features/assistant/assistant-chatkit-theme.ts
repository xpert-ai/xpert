import { DestroyRef, computed, inject, signal, type Signal } from '@angular/core'
import type { ChatKitTheme, ColorScheme } from '@xpert-ai/chatkit-types'

/** Use the same base variables as the host; do not substitute card colors or round through Hex. */
export function createAssistantChatkitTheme(document: Document, colorScheme: ColorScheme): ChatKitTheme {
  const style = document.defaultView?.getComputedStyle(document.documentElement)
  const background = style?.getPropertyValue('--background').trim()
  const foreground = style?.getPropertyValue('--foreground').trim()
  return {
    colorScheme,
    radius: 'soft',
    density: 'compact',
    typography: { baseSize: 14 },
    ...(background && foreground ? { color: { surface: { background, foreground } } } : {})
  }
}

export function injectAssistantChatkitTheme(document: Document, colorScheme: Signal<ColorScheme>) {
  const revision = signal(0)
  const Observer = document.defaultView?.MutationObserver
  const observer = Observer ? new Observer(() => revision.update((value) => value + 1)) : null
  observer?.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'class', 'style']
  })
  inject(DestroyRef).onDestroy(() => observer?.disconnect())
  return computed(() => {
    revision()
    return createAssistantChatkitTheme(document, colorScheme())
  })
}
