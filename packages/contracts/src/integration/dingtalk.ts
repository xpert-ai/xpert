import { IntegrationEnum, TIntegrationProvider } from '../integration.model'

export const IntegrationDingTalkProvider: TIntegrationProvider = {
  name: IntegrationEnum.DINGTALK,
  label: {
    en_US: 'DingTalk',
    zh_Hans: '钉钉'
  },
  avatar: 'dingtalk.png',
  webhook: true,
  schema: {
    type: 'object',
    properties: {}
  },
  pro: true
}
