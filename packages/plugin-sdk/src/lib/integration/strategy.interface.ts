import { IIntegration, TIntegrationProvider } from '@metad/contracts'
import { IntegrationRuntimeView, IntegrationTestView } from './runtime.types'

export type TIntegrationStrategyParams = {
  query: string
}

export interface IntegrationStrategy<T = unknown> {
  meta: TIntegrationProvider
  execute(integration: IIntegration<T>, payload: TIntegrationStrategyParams): Promise<any>
  onCreate?(integration: IIntegration<T>): Promise<void>
  onDelete?(integration: IIntegration<T>): Promise<void>
  onUpdate?(previous: IIntegration<T>, current: IIntegration<any>): Promise<void>
  validateConfig?(config: T, integration?: IIntegration<T>): Promise<void | IntegrationTestView>
  getRuntimeView?(integration: IIntegration<T>): Promise<IntegrationRuntimeView>
  runRuntimeAction?(integration: IIntegration<T>, action: string, payload?: unknown): Promise<IntegrationRuntimeView>
}
