import { IIntegration, IntegrationEnum, TIntegrationProvider } from '../integration.model'

export type TIntegrationLarkOptions = {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
  xpertId: string
  preferLanguage: string
}

export const IntegrationLarkProvider: TIntegrationProvider = {
  name: IntegrationEnum.LARK,
  label: {
    en_US: 'Lark',
    zh_Hans: '飞书'
  },
  avatar: 'lark.png',
  webhook: true,
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
      },
      preferLanguage: {
        type: 'select',
        title: {
          en_US: 'Preferred Language',
          zh_Hans: '首选语言'
        },
        options: [
          {
            value: 'en',
            label: {
              en_US: 'English',
              zh_Hans: '英语'
            }
          }, {
            value: 'zh',
            label: {
              en_US: 'Chinese',
              zh_Hans: '中文'
            }
          }
        ]
      },
    },
    required: ['appId', 'appSecret'],
    secret: ['appSecret', 'verificationToken', 'encryptKey']
  },
  webhookUrl: (integration: IIntegration, baseUrl: string) => {
    return `${baseUrl}/api/lark/webhook/${integration.id}`
  }
}
