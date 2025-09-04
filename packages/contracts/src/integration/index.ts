import { IntegrationEnum, TIntegrationProvider } from '../integration.model'
import { IntegrationDifyProvider } from './dify'
import { IntegrationDingTalkProvider } from './dingtalk'
import { IntegrationFastGPTProvider } from './fastgpt'
import { IntegrationFirecrawlProvider } from './firecrawl'
import { IntegrationGitHubProvider } from './github'
import { IntegrationLarkProvider } from './lark'
import { IntegrationRAGFlowProvider } from './ragflow'
import { IntegrationWeComProvider } from './wecom'

export * from './github'
export * from './lark'

export const INTEGRATION_PROVIDERS: Partial<Record<IntegrationEnum, TIntegrationProvider>> = {
  [IntegrationEnum.LARK]: IntegrationLarkProvider,
  [IntegrationEnum.DINGTALK]: IntegrationDingTalkProvider,
  [IntegrationEnum.WECOM]: IntegrationWeComProvider,
  [IntegrationEnum.FIRECRAWL]: IntegrationFirecrawlProvider,
  [IntegrationEnum.GITHUB]: IntegrationGitHubProvider,
  [IntegrationEnum.RAGFlow]: IntegrationRAGFlowProvider,
  [IntegrationEnum.Dify]: IntegrationDifyProvider,
  [IntegrationEnum.FastGPT]: IntegrationFastGPTProvider
}
