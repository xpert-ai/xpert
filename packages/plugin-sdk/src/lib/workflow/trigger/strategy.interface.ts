import { TWorkflowTriggerMeta, TXpertTeamNode } from '@metad/contracts'

export type TWorkflowTriggerBootstrapMode = 'replay_publish' | 'skip'

export type TWorkflowTriggerBootstrapConfig = {
  mode: TWorkflowTriggerBootstrapMode
  critical?: boolean
}

export type TWorkflowTriggerParams<T> = {
  xpertId: string
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

  validate(payload: TWorkflowTriggerParams<T>): Promise<any[]>

  /**
   * Initialize the trigger when publish xpert workflow
   * 
   * @param payload 
   * @param callback 
   */
  publish(payload: TWorkflowTriggerParams<T>, callback: (payload: any) => void): Promise<any> | void

  /**
   * Stop the trigger
   */
  stop(payload: TWorkflowTriggerParams<T>): void;
}
