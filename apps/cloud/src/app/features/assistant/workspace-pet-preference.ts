import { signal } from '@angular/core'

export function createWorkspacePetPreference(document: Document, key: string) {
  let initiallyVisible = true
  try {
    initiallyVisible = document.defaultView?.localStorage.getItem(key) !== '1'
  } catch {
    // Storage may be unavailable in a restricted browser.
  }
  const visible = signal(initiallyVisible)

  return {
    visible: visible.asReadonly(),
    setVisible(value: boolean) {
      visible.set(value)
      try {
        const storage = document.defaultView?.localStorage
        if (value) storage?.removeItem(key)
        else storage?.setItem(key, '1')
      } catch {
        // The current workspace still reflects the choice in memory.
      }
    }
  }
}
