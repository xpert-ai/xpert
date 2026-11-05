import { signal } from '@angular/core'

export function createWorkspacePetPreference(document: Document, key: string, defaultVisible: boolean) {
  let initiallyVisible = defaultVisible
  try {
    const hidden = document.defaultView?.localStorage.getItem(key)
    if (hidden === '1' || hidden === '0') initiallyVisible = hidden === '0'
  } catch {
    // Storage may be unavailable in a restricted browser.
  }
  const visible = signal(initiallyVisible)

  return {
    visible: visible.asReadonly(),
    setVisible(value: boolean) {
      visible.set(value)
      try {
        document.defaultView?.localStorage.setItem(key, value ? '0' : '1')
      } catch {
        // The current workspace still reflects the choice in memory.
      }
    }
  }
}
