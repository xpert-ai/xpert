import { IntegrationEnum, TIntegrationProvider } from '../integration.model'
import { IntegrationGitHubProvider } from './github'
// import { IntegrationLarkProvider } from './lark'
// import { IntegrationWeComProvider } from './wecom'

export * from './github'
export * from './lark'

export const INTEGRATION_PROVIDERS: Partial<Record<IntegrationEnum, TIntegrationProvider>> = {
  // [IntegrationEnum.LARK]: IntegrationLarkProvider,
  // [IntegrationEnum.WECOM]: IntegrationWeComProvider,
  [IntegrationEnum.GITHUB]: IntegrationGitHubProvider
}
