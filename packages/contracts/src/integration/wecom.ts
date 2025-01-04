import { IntegrationEnum, TIntegrationProvider } from '../integration.model'

export const IntegrationWeComProvider: TIntegrationProvider = {
  name: IntegrationEnum.WECOM,
  label: {
    en_US: 'WeCom',
    zh_Hans: '企业微信'
  },
  avatar: 'wecom.png',
  schema: {
    properties: {}
  },
  pro: true
}
