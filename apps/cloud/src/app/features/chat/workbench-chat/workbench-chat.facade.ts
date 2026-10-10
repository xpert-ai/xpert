import { InjectionToken, Signal } from '@angular/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import type {
  WorkbenchExtensionViewOpenRequest,
  IXpert,
  TAvatar,
  TXpertProjectAccessSummary,
  ProjectSelection,
  XpertWorkbenchInitialLayoutEnum
} from '@xpert-ai/contracts'
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
  currentXpert?: Signal<IXpert | null>
  assistantTitle?: Signal<string | null>
  assistantAvatar?: Signal<TAvatar | null>
  initialLayout: Signal<XpertWorkbenchInitialLayoutEnum | null>
  defaultViewKey: Signal<string | null>
  chatkitFrameUrl: Signal<string | null>
  threadId: Signal<string | null>
  /** Group sessions are bound by conversation ID; they do not load a private Assistant thread. */
  group?: Signal<{ id: string } | null>
  /** Current Chat Project route scope when this workbench supports Project isolation. */
  projectId?: Signal<string | null>
  /** Initial session binding only; ChatKit resolves runtime Project scope from the saved conversation. */
  chatkitMountProjectId?: Signal<string | null>
  /** Initial draft intent; distinct from a running conversation's persisted Project. */
  chatkitProjectSelection?: Signal<ProjectSelection>
  /** Refresh the persisted Project after a run starts or finishes, without starting a new conversation. */
  syncConversationProject?(threadId: string): Promise<void>
  /** Access for the current Project route; null is pending, unavailable, or denied. */
  projectAccess?: Signal<TXpertProjectAccessSummary | null>
  loading: Signal<boolean>
  loadingUserPreference: Signal<boolean>
  viewState: Signal<WorkbenchChatViewState>
  suppressAutoResume: Signal<boolean>
  pendingConversationStartId: Signal<number>
  activeConversation: Signal<IChatConversation | null>
  viewErrorMessage(): string
  onChatThreadChange(threadId: string | null): void
  onChatProjectChange?(
    projectId: string | null,
    view?: WorkbenchExtensionViewOpenRequest,
    selection?: ProjectSelection
  ): Promise<boolean> | void
  beginPendingConversation(startId: number, control: ChatKitControl): Promise<void>
  ensureConversationEntry(control: ChatKitControl): Promise<void>
  setActiveConversation(conversation: IChatConversation | null): void
  patchActiveConversationStatus(status: 'busy' | 'idle'): void
}

export const WORKBENCH_CHAT_FACADE = new InjectionToken<WorkbenchChatFacade>('WORKBENCH_CHAT_FACADE')
