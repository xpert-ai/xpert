import { IntegrationEnum } from '../integration.model'
import { IntegrationDingTalkProvider } from './dingtalk'
import { IntegrationFirecrawlProvider } from './firecrawl'
import { IntegrationLarkProvider } from './lark'
import { IntegrationWeComProvider } from './wecom'

export * from './lark'

export const INTEGRATION_PROVIDERS = {
  [IntegrationEnum.LARK]: IntegrationLarkProvider,
  [IntegrationEnum.DINGTALK]: IntegrationDingTalkProvider,
  [IntegrationEnum.WECOM]: IntegrationWeComProvider,
  [IntegrationEnum.FIRECRAWL]: IntegrationFirecrawlProvider,
}
