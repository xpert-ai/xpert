import { IIntegration, TIntegrationProvider } from '@metad/contracts'

export type TIntegrationStrategyParams = {
  query: string
}

export type IntegrationTestProbe = {
  connected?: boolean
  state?: string
  lastError?: string | null
  checkedAt?: number | null
}

export type IntegrationTestResult = {
  webhookUrl?: string
  mode?: string
  warnings?: string[]
  probe?: IntegrationTestProbe
} & Record<string, unknown>

export interface IntegrationStrategy<T = unknown> {
  meta: TIntegrationProvider
  execute(integration: IIntegration<T>, payload: TIntegrationStrategyParams): Promise<any>
  onUpdate?(previous: IIntegration<T>, current: IIntegration<any>): Promise<void> | void
  onDelete?(integration: IIntegration<T>): Promise<void> | void
  validateConfig?(config: T, integration?: IIntegration<T>): Promise<void | IntegrationTestResult>
}
