import { TWorkflowTriggerConnectionStatus, TWorkflowTriggerMeta, TXpertTeamNode } from '@xpert-ai/contracts'

export type TWorkflowTriggerBootstrapMode = 'replay_publish' | 'skip'

/**
 * Lifecycle policy for recovering published triggers during system bootstrap.
 * Declares recovery participation and criticality independently of normal publication.
 */
export type TWorkflowTriggerBootstrapConfig = {
  mode: TWorkflowTriggerBootstrapMode
  critical?: boolean
}

export type TWorkflowTriggerParams<T> = {
  xpertId: string
  /** Host-owned Assistant scope; never taken from trigger configuration. */
  scope?: { tenantId: string; organizationId: string | null; userId?: string; workspaceId?: string }
  /**
   * Supplementary instructions scoped to trigger-initiated runs.
   * Additive to existing task instructions; preserves the Assistant's instruction definition.
   */
  additionalInstructions?: string
  agentKey?: string
  node?: TXpertTeamNode
  config: T
}

export interface IWorkflowTriggerStrategy<T> {
  meta: TWorkflowTriggerMeta

  /**
   * Controls how this trigger should be recovered during system bootstrap.
   *
   * Default when omitted:
   * - mode: "replay_publish"
   * - critical: false
   */
  bootstrap?: TWorkflowTriggerBootstrapConfig

  /**
   * Assesses configuration validity within the supplied trigger context.
   * Reports validation findings without activating the trigger.
   */
  validate(payload: TWorkflowTriggerParams<T>): Promise<any[]>

  /**
   * Read-only snapshot of the connection represented by the trigger configuration.
   * Connection state is distinct from configuration validity and individual run outcomes.
   */
  connectionStatus?(config: T): Promise<Pick<TWorkflowTriggerConnectionStatus, 'connected' | 'state'>>

  /**
   * Read-only snapshot of trigger availability, connectivity and activity within an Assistant scope.
   * Describes the trigger's operational state independently of the Assistant's execution state.
   */
  assistantStatus?(params: TWorkflowTriggerParams<T>): Promise<{
    /** Availability within the supplied Assistant and actor scope. */
    available: boolean
    /** Connection state, independent of individual run outcomes. */
    connection: TWorkflowTriggerConnectionStatus['state']
    /** Latest trigger activity time (ISO 8601), or null if none. */
    lastActivityAt: string | null
    /** Latest run initiation time (ISO 8601), distinct from completion; null if none. */
    lastRunAt: string | null
  }>

  /**
   * Initialize the trigger when publish xpert workflow
   *
   * @param payload
   * @param callback
   */
  publish(payload: TWorkflowTriggerParams<T>, callback: (payload: any) => Promise<void> | void): Promise<any> | void

  /**
   * Stop the trigger
   */
  stop(payload: TWorkflowTriggerParams<T>): void
}
