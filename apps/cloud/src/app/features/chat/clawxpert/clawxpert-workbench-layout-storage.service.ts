import { DOCUMENT } from '@angular/common'
import { inject, Injectable } from '@angular/core'

export type ClawXpertWorkbenchLayoutState = 'minimized' | 'normal' | 'maximized'

const STORAGE_KEY_PREFIX = 'xpert.clawxpert.workbench.layout.v1:'

export function getClawXpertWorkbenchLayoutStorageKey(assistantId: string) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(assistantId.trim())}`
}

@Injectable({ providedIn: 'root' })
export class ClawXpertWorkbenchLayoutStorage {
  readonly #document = inject(DOCUMENT)

  load(assistantId: string): ClawXpertWorkbenchLayoutState | null {
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedAssistantId || !storage) {
      return null
    }

    try {
      return normalizeWorkbenchLayoutState(
        storage.getItem(getClawXpertWorkbenchLayoutStorageKey(normalizedAssistantId))
      )
    } catch {
      return null
    }
  }

  save(assistantId: string, state: ClawXpertWorkbenchLayoutState): boolean {
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedAssistantId || !storage) {
      return false
    }

    try {
      storage.setItem(getClawXpertWorkbenchLayoutStorageKey(normalizedAssistantId), state)
      return true
    } catch {
      return false
    }
  }

  private getStorage(): Storage | null {
    try {
      return this.#document.defaultView?.localStorage ?? null
    } catch {
      return null
    }
  }
}

function normalizeWorkbenchLayoutState(value: string | null): ClawXpertWorkbenchLayoutState | null {
  return value === 'minimized' || value === 'normal' || value === 'maximized' ? value : null
}
