import type { AssistantWorkbenchTarget, WorkbenchExtensionViewOpenRequest } from '@xpert-ai/contracts'
import type { Bot } from './types'

export interface ProjectNavigation {
  target: 'project.pipelines'
  projectId: string
  organizationId?: string | null
  pipelineInstanceId?: string
  pipelineRoundId?: string
  pipelineNodeId?: string
}
export type WorkbenchNavigation = ProjectNavigation | AssistantWorkbenchTarget
export type DesktopWorkbenchTarget = WorkbenchExtensionViewOpenRequest & {
  assistantId: string
  projectId: string | null
  organizationId: string | null
  source?: WorkbenchNavigation
  requestId?: string
}
export type ResolvedWorkbenchTarget = DesktopWorkbenchTarget & { source: WorkbenchNavigation; bot: Bot }
export type WorkbenchRuntimeScope = { assistantId: string; projectId: string | null; organizationId: string | null }
