import { InjectionToken, Signal } from '@angular/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import type { XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import { IChatConversation } from '../../../@core'

export type WorkbenchChatViewState = 'organization-required' | 'wizard' | 'ready' | 'error'

export type WorkbenchChatDefinition = {
  titleKey: string
  defaultTitle: string
}

export type WorkbenchChatFacade = {
  definition: WorkbenchChatDefinition
  identity: Signal<string | null>
  userId: Signal<string | null>
  assistantId: Signal<string | null>
  xpertId: Signal<string | null>
  initialLayout: Signal<XpertWorkbenchInitialLayoutEnum | null>
  defaultViewKey: Signal<string | null>
  chatkitFrameUrl: Signal<string | null>
  threadId: Signal<string | null>
  /** Current Chat Project route scope when this workbench supports Project isolation. */
  projectId?: Signal<string | null>
  loading: Signal<boolean>
  loadingUserPreference: Signal<boolean>
  viewState: Signal<WorkbenchChatViewState>
  suppressAutoResume: Signal<boolean>
  pendingConversationStartId: Signal<number>
  activeConversation: Signal<IChatConversation | null>
  viewErrorMessage(): string
  onChatThreadChange(threadId: string | null): void
  onChatProjectChange?(projectId: string | null): void
  beginPendingConversation(startId: number, control: ChatKitControl): Promise<void>
  ensureConversationEntry(control: ChatKitControl): Promise<void>
  setActiveConversation(conversation: IChatConversation | null): void
  patchActiveConversationStatus(status: 'busy' | 'idle'): void
}

export const WORKBENCH_CHAT_FACADE = new InjectionToken<WorkbenchChatFacade>('WORKBENCH_CHAT_FACADE')
