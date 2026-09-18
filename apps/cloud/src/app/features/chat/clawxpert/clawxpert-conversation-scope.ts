import { InjectionToken, Signal } from '@angular/core'
import type { ClawXpertConversationScope } from '@xpert-ai/contracts'

export const CLAWXPERT_CONVERSATION_SCOPE = new InjectionToken<Signal<ClawXpertConversationScope>>(
  'ClawXpert conversation scope'
)

export function clawXpertConversationScope(url: string): ClawXpertConversationScope | null {
  const path = url.split(/[?#]/)[0].replace(/\/$/, '')
  if (path === '/chat/clawxpert/c' || path.startsWith('/chat/clawxpert/c/')) return 'task'
  if (
    path === '/chat/clawxpert/assistant' ||
    path.startsWith('/chat/clawxpert/assistant/') ||
    path === '/chat/clawxpert/settings'
  )
    return 'assistant'
  return null
}

export function clawXpertConversationPath(scope: ClawXpertConversationScope, threadId?: string | null) {
  const base = scope === 'assistant' ? '/chat/clawxpert/assistant' : '/chat/clawxpert/c'
  return threadId ? `${base}/${encodeURIComponent(threadId)}` : base
}

export function clawXpertScopedThreadId(url: string, scope: ClawXpertConversationScope): string | null {
  const path = url.split(/[?#]/)[0]
  const prefix = `${clawXpertConversationPath(scope)}/`
  if (!path.startsWith(prefix)) return null
  try {
    return decodeURIComponent(path.slice(prefix.length)) || null
  } catch {
    return null
  }
}
