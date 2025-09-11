import { IIntegration, TIntegrationProvider } from '@metad/contracts'

export type TIntegrationStrategyParams = {
  query: string
}

export interface IntegrationStrategy {
  meta: TIntegrationProvider
  execute(integration: IIntegration, payload: TIntegrationStrategyParams): Promise<any>
}
