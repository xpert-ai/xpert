import { DOCUMENT } from '@angular/common'
import { inject, Injectable } from '@angular/core'

export type ClawXpertWorkbenchLayoutState = 'minimized' | 'normal' | 'maximized'

const STORAGE_KEY_PREFIX = 'xpert.clawxpert.workbench.layout.v2:'

export function getClawXpertWorkbenchLayoutStorageKey(userId: string, assistantId: string) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(userId.trim())}:${encodeURIComponent(assistantId.trim())}`
}

@Injectable({ providedIn: 'root' })
export class ClawXpertWorkbenchLayoutStorage {
  readonly #document = inject(DOCUMENT)

  load(userId: string, assistantId: string): ClawXpertWorkbenchLayoutState | null {
    const normalizedUserId = userId.trim()
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedUserId || !normalizedAssistantId || !storage) {
      return null
    }

    try {
      return normalizeWorkbenchLayoutState(
        storage.getItem(getClawXpertWorkbenchLayoutStorageKey(normalizedUserId, normalizedAssistantId))
      )
    } catch {
      return null
    }
  }

  save(userId: string, assistantId: string, state: ClawXpertWorkbenchLayoutState): boolean {
    const normalizedUserId = userId.trim()
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedUserId || !normalizedAssistantId || !storage) {
      return false
    }

    try {
      storage.setItem(getClawXpertWorkbenchLayoutStorageKey(normalizedUserId, normalizedAssistantId), state)
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
