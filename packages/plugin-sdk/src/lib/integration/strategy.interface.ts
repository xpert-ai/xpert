import { IIntegration, TEnterpriseH5IdentityGrant, TIntegrationProvider } from '@xpert-ai/contracts'

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

/** Identity proof accepted by an integration strategy for enterprise H5 exchange. */
export type IntegrationIdentityGrant = TEnterpriseH5IdentityGrant

/** Public integration data required before the browser requests an identity grant. */
export type IntegrationIdentityBootstrap = {
  externalOrganizationId: string
  clientConfig: Record<string, unknown>
}

/** Enterprise identity verified by an integration, with optional Xpert account binding. */
export type IntegrationExternalIdentity = {
  provider: string
  externalOrganizationId: string
  subjectId: string
  displayName?: string
  accountBinding?: {
    provider: string
    subjectId: string
  }
}

export interface IntegrationStrategy<T = unknown> {
  meta: TIntegrationProvider
  execute(integration: IIntegration<T>, payload: TIntegrationStrategyParams): Promise<any>
  onUpdate?(previous: IIntegration<T>, current: IIntegration<any>): Promise<void> | void
  onDelete?(integration: IIntegration<T>): Promise<void> | void
  validateConfig?(config: T, integration?: IIntegration<T>): Promise<void | IntegrationTestResult>
  getIdentityBootstrap?(integration: IIntegration<T>): Promise<IntegrationIdentityBootstrap>
  exchangeIdentity?(integration: IIntegration<T>, grant: IntegrationIdentityGrant): Promise<IntegrationExternalIdentity>
}
