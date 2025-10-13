import { IIntegration, IntegrationFeatureEnum, TIntegrationProvider } from '@metad/contracts'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { translate } from './i18n'
import { LarkClient } from './lark.client'
import { LarkName, TLarkIntegrationConfig, iconImage } from './types'

@Injectable()
@IntegrationStrategyKey(LarkName)
export class LarkIntegrationStrategy implements IntegrationStrategy<TLarkIntegrationConfig> {
  meta: TIntegrationProvider = {
    name: LarkName,
    label: {
      en_US: 'Lark',
      zh_Hans: '飞书'
    },
    description: {
      en_US:
        'Lark is a leading enterprise collaboration platform, integrating cutting-edge AI capabilities to build superior communication tools.',
      zh_Hans: '飞书是领先的企业协作平台，融合尖端的 AI 能力，构建卓越的沟通工具。'
    },
    icon: {
      type: 'image',
      value: iconImage
    },
    schema: {
      type: 'object',
      properties: {
        isLark: {
          type: 'boolean',
          title: {
            en_US: 'Is Lark',
            zh_Hans: '国际版'
          }
        },
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
          placeholder: {
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
              en: {
                en_US: 'English',
                zh_Hans: '英语'
              },
              zh: {
                en_US: 'Chinese',
                zh_Hans: '中文'
              }
            }
          }
        }
      }
    },
    features: [IntegrationFeatureEnum.SSO, IntegrationFeatureEnum.KNOWLEDGE],
    helpUrl: 'https://feishu.cn/'
  }

  execute(integration: IIntegration, payload: TIntegrationStrategyParams): Promise<any> {
    throw new Error('Method not implemented.')
  }

  async validateConfig(config: TLarkIntegrationConfig) {
    if (!config) {
      throw new Error(translate('Error.LarkConfigurationRequired'))
    }
    if (!config.appId) {
      throw new Error('App ID is required')
    }
    if (!config.appSecret) {
      throw new Error('App Secret is required')
    }

    const larkClient = new LarkClient({ options: config } as IIntegration)
    const botInfo = await larkClient.getBotInfo()
    if (!botInfo) {
      const error = translate('Error.BotPermission')

      throw new ForbiddenException(error)
    }

    return botInfo
  }
}
