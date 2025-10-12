import { IIntegration, TIntegrationProvider } from '@metad/contracts'

export type TIntegrationStrategyParams = {
  query: string
}

export interface IntegrationStrategy<T = unknown> {
  meta: TIntegrationProvider
  execute(integration: IIntegration<T>, payload: TIntegrationStrategyParams): Promise<any>
  validateConfig?(config: T): Promise<void>
}
