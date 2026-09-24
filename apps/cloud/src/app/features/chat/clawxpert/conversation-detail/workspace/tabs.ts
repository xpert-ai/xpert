import type { FileChangeReviewTab } from '../../file-change-review.types'
import type { ClawXpertFixedViewTab } from '../../clawxpert-fixed-view-stack.component'
import type { WorkbenchArtifactTab } from '../../workbench-artifact-tabs'
import type { ClawXpertBrowserTab } from './browser'

export type ClawXpertStaticTabId = 'files' | 'terminal' | 'tasks'

export type ClawXpertAddableWorkspaceTabKind = ClawXpertStaticTabId | 'browser'

export type ClawXpertWorkspaceTabKind = ClawXpertAddableWorkspaceTabKind | 'fixed-view' | 'artifact' | 'file-review'

export type ClawXpertToolTab = {
  id: string
  kind: ClawXpertStaticTabId
}

export type ClawXpertWorkspaceTab =
  | ClawXpertToolTab
  | ClawXpertBrowserTab
  | ClawXpertFixedViewTab
  | WorkbenchArtifactTab
  | FileChangeReviewTab

export type ClawXpertConversationPanel = ClawXpertStaticTabId | 'preview' | 'fixed-view' | 'artifact' | 'file-review'

export const TASKS_WORKSPACE_TAB_ID = 'tasks'
