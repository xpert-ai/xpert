import { IntegrationEnum } from '../integration.model'
import { IntegrationDingTalkProvider } from './dingtalk'
import { IntegrationLarkProvider } from './lark'
import { IntegrationWeComProvider } from './wecom'

export const INTEGRATION_PROVIDERS = {
  [IntegrationEnum.LARK]: IntegrationLarkProvider,
  [IntegrationEnum.DINGTALK]: IntegrationDingTalkProvider,
  [IntegrationEnum.WECOM]: IntegrationWeComProvider,
}
