import { computed, effect, inject, Injectable, OnDestroy, signal, untracked } from '@angular/core'
import { Router } from '@angular/router'
import type { ChatKitControl } from '@xpert-ai/chatkit-angular'
import type { IChatConversation } from '../../../@core'
import { WorkbenchChatFacade } from '../workbench-chat/workbench-chat.facade'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertConversationEntryStore } from './clawxpert-conversation-entry.store'
import {
  CLAWXPERT_CONVERSATION_SCOPE,
  clawXpertConversationPath,
  clawXpertConversationScope,
  clawXpertScopedThreadId
} from './clawxpert-conversation-scope'

@Injectable()
export class ClawXpertScopedConversationFacade implements WorkbenchChatFacade, OnDestroy {
  private readonly shared = inject(ClawXpertFacade)
  private readonly router = inject(Router)
  private readonly entries = inject(ClawXpertConversationEntryStore)
  readonly scope = inject(CLAWXPERT_CONVERSATION_SCOPE)
  readonly definition = this.shared.definition
  readonly identity = computed(() => `${this.shared.identity()}:${this.scope()}`)
  readonly userId = this.shared.userId
  readonly assistantId = this.shared.assistantId
  readonly xpertId = this.shared.xpertId
  readonly currentXpert = this.shared.currentXpert
  readonly assistantTitle = this.shared.assistantTitle
  readonly assistantAvatar = this.shared.assistantAvatar
  readonly initialLayout = this.shared.initialLayout
  readonly defaultViewKey = this.shared.defaultViewKey
  readonly chatkitFrameUrl = this.shared.chatkitFrameUrl
  readonly loading = this.shared.loading
  readonly loadingUserPreference = this.shared.loadingUserPreference
  readonly viewState = this.shared.viewState
  readonly threadId = signal<string | null>(null)
  readonly activeConversation = signal<IChatConversation | null>(null)
  readonly suppressAutoResume = signal(true)
  readonly pendingConversationStartId = computed(() =>
    this.scope() === 'task' && this.active() ? this.shared.pendingConversationStartId() : 0
  )
  readonly active = computed(() => clawXpertConversationScope(this.shared.currentUrl()) === this.scope())
  private initialized = false
  private entryInitialized = false
  private resetInProgress = false
  private nullGuardUntil = 0
  private ownerKey: string | null = null
  private destroyed = false
  private owner = computed(() => {
    const userId = this.userId()
    const organizationId = this.shared.organizationId()
    const xpertId = this.xpertId()
    return userId && organizationId && xpertId ? { userId, organizationId, xpertId } : null
  })

  constructor() {
    effect(() => {
      const url = this.shared.currentUrl()
      const scope = this.scope()
      const owner = this.owner()
      if (!owner || clawXpertConversationScope(url) !== scope) return
      const ownerKey = JSON.stringify(owner)
      if (this.ownerKey && this.ownerKey !== ownerKey) return
      this.ownerKey = ownerKey
      untracked(() => {
        const routed = clawXpertScopedThreadId(url, scope)
        if (!this.initialized) {
          this.initialized = true
          const restored = scope === 'assistant' ? this.entries.assistantThread(owner) : null
          this.threadId.set(routed ?? restored)
          if (this.threadId()) this.nullGuardUntil = Date.now() + 1000
        } else if (url !== '/chat/clawxpert/settings') {
          if (routed || scope === 'task') {
            if (routed !== this.threadId()) this.nullGuardUntil = Date.now() + 1000
            this.threadId.set(routed)
          }
        }
        if (scope === 'assistant') {
          this.entries.setAssistantThread(owner, this.threadId())
          if (url === clawXpertConversationPath(scope) && this.threadId()) {
            void this.router.navigateByUrl(clawXpertConversationPath(scope, this.threadId()), { replaceUrl: true })
          }
        }
      })
    })
  }

  isCurrentRoute() {
    return this.ownsCurrentBinding() && clawXpertConversationScope(this.router.url) === this.scope()
  }
  viewErrorMessage() {
    return this.shared.viewErrorMessage()
  }

  async beginPendingConversation(startId: number, control: ChatKitControl) {
    if (!this.isCurrentRoute() || this.scope() !== 'task') return
    this.entryInitialized = true
    this.resetInProgress = true
    try {
      await this.shared.beginPendingConversation(startId, control)
      await control.setComposerValue({ text: '', reply: '', attachments: [], references: [] })
    } finally {
      this.resetInProgress = false
    }
  }

  async ensureConversationEntry(control: ChatKitControl) {
    if (this.entryInitialized || this.threadId() || !this.isCurrentRoute() || this.viewState() !== 'ready') return
    this.entryInitialized = true
    this.resetInProgress = true
    try {
      await control.setThreadId(null)
      await control.setRuntimeCapabilities(null)
      if (this.isCurrentRoute()) await control.focusComposer()
    } finally {
      this.resetInProgress = false
    }
  }

  onChatThreadChange(threadId: string | null) {
    // A background response may finish after switching entries. Remember it without navigating.
    if (!this.ownsCurrentBinding() || this.resetInProgress || threadId === this.threadId()) return
    if (!threadId && this.threadId() && Date.now() < this.nullGuardUntil) return
    this.threadId.set(threadId)
    if (threadId) this.nullGuardUntil = Date.now() + 1000
    const owner = this.owner()
    if (this.scope() === 'assistant' && owner) this.entries.setAssistantThread(owner, threadId)
    if (this.isCurrentRoute()) {
      const queryIndex = this.router.url.search(/[?#]/)
      const query = queryIndex < 0 ? '' : this.router.url.slice(queryIndex)
      void this.router.navigateByUrl(`${clawXpertConversationPath(this.scope(), threadId)}${query}`)
    }
  }

  setActiveConversation(conversation: IChatConversation | null) {
    if (!this.ownsCurrentBinding()) return
    this.activeConversation.set(conversation)
    if (this.scope() === 'task' && this.isCurrentRoute()) this.shared.setActiveConversation(conversation)
  }

  patchActiveConversationStatus(status: 'busy' | 'idle') {
    if (!this.ownsCurrentBinding()) return
    this.activeConversation.update((conversation) => (conversation ? { ...conversation, status } : null))
  }

  private ownsCurrentBinding() {
    return !this.destroyed && this.ownerKey !== null && this.ownerKey === JSON.stringify(this.owner())
  }

  ngOnDestroy() {
    this.destroyed = true
  }
}
