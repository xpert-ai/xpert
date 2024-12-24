import { IIntegration, IntegrationEnum, TIntegrationProvider } from '../integration.model'

export const IntegrationLarkProvider: TIntegrationProvider = {
  name: IntegrationEnum.LARK,
  label: {
    en_US: 'Lark',
    zh_Hans: '飞书'
  },
  avatar: 'lark.png',
  schema: {
    type: 'object',
    properties: {
      appId: { type: 'string', title: 'App ID' },
      appSecret: { type: 'string', title: 'App Secret' },
      verificationToken: { type: 'string', title: 'Verification Token' },
      encryptKey: {
        type: 'string',
        title: {
          en_US: 'Encrypt Key'
          // zh_Hans: '加密密钥'
        }
      },
      xpertId: {
        type: 'remote-select',
        title: {
          en_US: 'Xpert',
          zh_Hans: '数字专家'
        },
        placeholder: {
          en_US: 'Choose a corresponding digital expert',
          zh_Hans: '选择一个对应的数字专家'
        },
        selectUrl: '/api/xpert/select-options'
      }
    },
    required: ['appId', 'appSecret'],
    secret: ['appSecret', 'verificationToken', 'encryptKey']
  },
  webhookUrl: (integration: IIntegration, baseUrl: string) => {
    return `${baseUrl}/api/lark/webhook/${integration.id}`
  }
}
