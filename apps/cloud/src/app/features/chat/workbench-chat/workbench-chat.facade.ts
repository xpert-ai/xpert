import { InjectionToken, Signal } from '@angular/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { IChatConversation } from '../../../@core'

export type WorkbenchChatViewState = 'organization-required' | 'wizard' | 'ready' | 'error'

export type WorkbenchChatDefinition = {
  titleKey: string
  defaultTitle: string
}

export type WorkbenchChatFacade = {
  definition: WorkbenchChatDefinition
  identity: Signal<string | null>
  assistantId: Signal<string | null>
  xpertId: Signal<string | null>
  chatkitFrameUrl: Signal<string | null>
  threadId: Signal<string | null>
  loading: Signal<boolean>
  loadingUserPreference: Signal<boolean>
  viewState: Signal<WorkbenchChatViewState>
  suppressAutoResume: Signal<boolean>
  pendingConversationStartId: Signal<number>
  activeConversation: Signal<IChatConversation | null>
  viewErrorMessage(): string
  onChatThreadChange(threadId: string | null): void
  beginPendingConversation(startId: number, control: ChatKitControl): Promise<void>
  ensureConversationEntry(control: ChatKitControl): Promise<void>
  setActiveConversation(conversation: IChatConversation | null): void
  patchActiveConversationStatus(status: 'busy' | 'idle'): void
}

export const WORKBENCH_CHAT_FACADE = new InjectionToken<WorkbenchChatFacade>('WORKBENCH_CHAT_FACADE')
