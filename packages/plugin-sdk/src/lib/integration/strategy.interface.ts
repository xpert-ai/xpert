import { IIntegration, TIntegrationProvider } from '@metad/contracts'

export type TIntegrationStrategyParams = {
  query: string
}

export interface IntegrationStrategy<T = unknown> {
  meta: TIntegrationProvider
  execute(integration: IIntegration<T>, payload: TIntegrationStrategyParams): Promise<any>
  onUpdate?(previous: IIntegration<T>, current: IIntegration<any>): Promise<void> | void
  onDelete?(integration: IIntegration<T>): Promise<void> | void
  validateConfig?(config: T, integration?: IIntegration<T>): Promise<void | {
    webhookUrl: string
  }>
}
