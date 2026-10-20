import type { ProjectPipelineStatistics } from './statistics'
import type { ProjectPipelineDefinition } from './definition.schema'
import type { ProjectPipelineProjectionNode, ProjectPipelineProjectionEdge } from './projection.schema'
import type { ProjectTaskGraph } from '../project-task-graph.model'
import type { ProjectPipelineEvidenceRef } from './runtime.schema'

export interface ProjectPipelineSummary {
  id: string
  title: string
  authority: 'provider' | 'platform'
  ownerRef: string
  sourceKey: string
  revision: number
  updatedAt: string
}

export interface ProjectPipelineGraph {
  projectId: string
  instance: ProjectPipelineSummary
  cursor: string
  definition: ProjectPipelineDefinition
  runId: string
  runState: string
  roundId: string
  historical: boolean
  historyComplete: boolean
  snapshotAt: string
  round: { sequence: number; generation: number; state: string; inputDigest: string }
  nodes: Array<{
    id: string
    projection: ProjectPipelineProjectionNode
    taskIds: string[]
    /** Exact attempts owned by this node in roundId. Absence means unknown, never task history. */
    executionIds?: string[]
  }>
  edges: ProjectPipelineProjectionEdge[]
  executionAttribution?: { scope: 'node_round'; unattributedCount: number }
  statistics: ProjectPipelineStatistics
  tasks: ProjectTaskGraph
  refresh: ProjectPipelineRefreshStatus | null
  /** Absent on older hosts; false prevents new dispatch while recovery remains available. */
  dispatchEnabled?: boolean
  permissions: { canEdit: boolean; canManage: boolean }
  attentions: ProjectPipelineAttention[]
  actions: { cancel: boolean; retries: Array<{ nodeInstanceId: string; operationId: string }> }
}

export interface ProjectPipelineAttention {
  /** Provider actions are read-only triage entries, never human decision records. */
  source?: 'coordinator' | 'provider_action'
  id: string
  nodeInstanceId: string
  kind: 'human' | 'unknown' | 'blocked'
  state: 'open' | 'resolved' | 'superseded'
  revision: number
  generation: number
  inputDigest: string
  reasonCode: string
  outcomes: string[]
  inputEvidence: ProjectPipelineEvidenceRef[]
}

export interface ProjectPipelineRefreshStatus {
  state: 'queued' | 'running' | 'ready' | 'not_found' | 'failed'
  errorCode: string | null
  updatedAt: string
}

export interface ProjectPipelineRoundSummary {
  id: string
  runId: string
  sequence: number
  generation: number
  state: string
  current: boolean
  createdAt: string
}
