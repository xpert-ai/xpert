import { IntegrationEnum, TIntegrationProvider } from '../integration.model'
import { IntegrationDingTalkProvider } from './dingtalk'
import { IntegrationGitHubProvider } from './github'
// import { IntegrationLarkProvider } from './lark'
// import { IntegrationWeComProvider } from './wecom'

export * from './github'
export * from './lark'

export const INTEGRATION_PROVIDERS: Partial<Record<IntegrationEnum, TIntegrationProvider>> = {
  // [IntegrationEnum.LARK]: IntegrationLarkProvider,
  [IntegrationEnum.DINGTALK]: IntegrationDingTalkProvider,
  // [IntegrationEnum.WECOM]: IntegrationWeComProvider,
  [IntegrationEnum.GITHUB]: IntegrationGitHubProvider,
}
