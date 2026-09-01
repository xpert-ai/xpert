import { DOCUMENT } from '@angular/common'
import { inject, Injectable } from '@angular/core'

export type ClawXpertWorkbenchLayoutState = 'minimized' | 'normal' | 'maximized' | 'overlay'

const STORAGE_KEY_PREFIX = 'xpert.clawxpert.workbench.layout.v2:'
const CHATKIT_PET_STORAGE_KEY_PREFIX = 'xpert.clawxpert.chatkit.pet.v1:'

export function getClawXpertWorkbenchLayoutStorageKey(userId: string, assistantId: string) {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(userId.trim())}:${encodeURIComponent(assistantId.trim())}`
}

export function getClawXpertChatkitPetStorageKey(userId: string, assistantId: string) {
  return `${CHATKIT_PET_STORAGE_KEY_PREFIX}${encodeURIComponent(userId.trim())}:${encodeURIComponent(assistantId.trim())}`
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

  loadChatkitPet(userId: string, assistantId: string): boolean | null {
    const value = this.read(userId, assistantId, getClawXpertChatkitPetStorageKey)
    return value === 'true' ? true : value === 'false' ? false : null
  }

  saveChatkitPet(userId: string, assistantId: string, minimized: boolean): boolean {
    return this.write(userId, assistantId, getClawXpertChatkitPetStorageKey, String(minimized))
  }

  private read(userId: string, assistantId: string, key: (userId: string, assistantId: string) => string) {
    const normalizedUserId = userId.trim()
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedUserId || !normalizedAssistantId || !storage) return null
    try {
      return storage.getItem(key(normalizedUserId, normalizedAssistantId))
    } catch {
      return null
    }
  }

  private write(
    userId: string,
    assistantId: string,
    key: (userId: string, assistantId: string) => string,
    value: string
  ) {
    const normalizedUserId = userId.trim()
    const normalizedAssistantId = assistantId.trim()
    const storage = this.getStorage()
    if (!normalizedUserId || !normalizedAssistantId || !storage) return false
    try {
      storage.setItem(key(normalizedUserId, normalizedAssistantId), value)
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
  return value === 'minimized' || value === 'normal' || value === 'maximized' || value === 'overlay' ? value : null
}
