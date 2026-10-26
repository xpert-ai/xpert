import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

/** Lifecycle ownership is assigned by trusted creation code, never inferred from async/background mode. */
export type TExecutionOwnership = {
  policy: 'attached' | 'detached' | 'shared'
  parentExecutionId?: string
  rootExecutionId: string
}

export type TExecutionControlIntent = 'running' | 'paused' | 'terminated'

/** Local tool receipts describe actual calls, not aborted LangChain wrappers. */
export type TExecutionWorkReceipt = {
  id: string
  executionId: string
  settled: boolean
}

/** Internal control facts; public clients receive a separate control view. */
export interface IExecutionControl extends IBasePerTenantAndOrganizationEntityModel {
  executionId: string
  threadId: string
  rootExecutionId: string
  ownership: TExecutionOwnership
  ancestors: string[]
  desired: TExecutionControlIntent
  revision: number
  graphEnded: boolean
  work: TExecutionWorkReceipt[]
}
