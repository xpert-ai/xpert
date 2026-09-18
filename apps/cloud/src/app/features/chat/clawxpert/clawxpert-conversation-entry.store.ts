import { Injectable } from '@angular/core'

export interface ClawXpertConversationOwner {
  userId: string
  organizationId: string
  xpertId: string
}

/** Only thread identifiers are persisted; unsent input stays inside each mounted chat. */
@Injectable({ providedIn: 'root' })
export class ClawXpertConversationEntryStore {
  private readonly memory = new Map<string, string | null>()

  assistantThread(owner: ClawXpertConversationOwner): string | null {
    const key = this.key(owner)
    if (this.memory.has(key)) return this.memory.get(key) ?? null
    try {
      const threadId = localStorage.getItem(key)?.trim() || null
      this.memory.set(key, threadId)
      return threadId
    } catch {
      return null
    }
  }

  setAssistantThread(owner: ClawXpertConversationOwner, threadId: string | null) {
    const key = this.key(owner)
    this.memory.set(key, threadId)
    try {
      if (threadId) localStorage.setItem(key, threadId)
      else localStorage.removeItem(key)
    } catch {
      /* The mounted conversation remains available without browser storage. */
    }
  }

  private key(owner: ClawXpertConversationOwner) {
    return `xpert:assistant-conversation:v1:${JSON.stringify([owner.userId, owner.organizationId, owner.xpertId])}`
  }
}
