import { IIntegration, IntegrationEnum, TIntegrationProvider } from '../integration.model'

export type TIntegrationLarkOptions = {
  isLark?: boolean
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
      isLark: { type: 'boolean', title: {
        en_US: 'Is Lark',
        zh_Hans: '国际版'
      } },
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
        type: 'string',
        title: {
          en_US: 'Xpert',
          zh_Hans: '数字专家'
        },
        description: {
          en_US: 'Choose a corresponding digital expert',
          zh_Hans: '选择一个对应的数字专家'
        },
        'x-ui': {
          component: 'remoteSelect',
          selectUrl: '/api/xpert/select-options'
        }
      },
      preferLanguage: {
        type: 'string',
        title: {
          en_US: 'Preferred Language',
          zh_Hans: '首选语言'
        },
        enum: ['en', 'zh'],
        'x-ui': {
          enumLabels: {
            en: { en_US: 'English', zh_Hans: '英语' },
            zh: { en_US: 'Chinese', zh_Hans: '中文' }
          }
        }
      },
    },
    required: ['appId', 'appSecret'],
    secret: ['appSecret', 'verificationToken', 'encryptKey']
  },
  // webhookUrl: (integration: IIntegration, baseUrl: string) => {
  //   return `${baseUrl}/api/lark/webhook/${integration.id}`
  // }
}
