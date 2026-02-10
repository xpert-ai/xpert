import { Injectable, Logger } from '@nestjs/common'
import { IIntegration, TIntegrationLarkOptions, TIntegrationProvider } from '@metad/contracts'
import { IntegrationStrategy, IntegrationStrategyKey, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import axios, { AxiosError } from 'axios'
import { iconImage, INTEGRATION_LARK } from './types'

/**
 * Lark Integration Strategy
 *
 * Implements IntegrationStrategy for Lark (Feishu) platform.
 * This strategy is used for:
 * - Validating Lark integration configuration
 * - Testing Lark API connection
 * - Providing integration metadata
 *
 * Note: For chat channel operations (sending/receiving messages),
 * use LarkChannelStrategy instead.
 */
@Injectable()
@IntegrationStrategyKey(INTEGRATION_LARK)
export class LarkIntegrationStrategy implements IntegrationStrategy<TIntegrationLarkOptions> {
  private readonly logger = new Logger(LarkIntegrationStrategy.name)

  meta: TIntegrationProvider = {
    name: INTEGRATION_LARK,
    label: {
      en_US: 'Lark',
      zh_Hans: '飞书'
    },
    icon: {
      type: 'image',
      value: iconImage
    },
    description: {
      en_US: 'Integration with Lark (Feishu) platform for messaging and collaboration.',
      zh_Hans: '与飞书平台的集成，用于消息传递和协作。'
    },
    webhook: true,
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
            en_US: 'Encrypt Key',
            zh_Hans: '加密密钥'
          }
        },
        // xpertId: {
        //   type: 'string',
        //   title: {
        //     en_US: 'Xpert',
        //     zh_Hans: '数字专家'
        //   },
        //   description: {
        //     en_US: 'Choose a corresponding digital expert',
        //     zh_Hans: '选择一个对应的数字专家'
        //   },
        //   'x-ui': {
        //     component: 'remoteSelect',
        //     selectUrl: '/api/xpert/select-options'
        //   }
        // },
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
        }
      },
      required: ['appId', 'appSecret'],
      secret: ['appSecret', 'verificationToken', 'encryptKey']
    }
    // webhookUrl: (integration: IIntegration, baseUrl: string) => {
    //   return `${baseUrl}/api/lark/webhook/${integration.id}`
    // }
  }

  /**
   * Execute integration action (not used for Lark, but required by interface)
   */
  async execute(integration: IIntegration<TIntegrationLarkOptions>, payload: TIntegrationStrategyParams): Promise<any> {
    // Lark integration doesn't have a generic execute action
    // Chat operations are handled by LarkChannelStrategy
    return null
  }

  /**
   * Validate Lark integration configuration
   *
   * This method is called when user clicks "Test" button in the UI.
   * It validates the configuration and tests the actual Lark API connection.
   *
   * @param config - Lark configuration options
   * @throws Error if configuration is invalid or connection fails
   */
  async validateConfig(config: TIntegrationLarkOptions): Promise<void> {
    // Validate required fields
    if (!config?.appId) {
      throw new Error('App ID is required')
    }

    if (!config?.appSecret) {
      throw new Error('App Secret is required')
    }

    // Test actual connection to Lark API
    try {
      const baseUrl = config.isLark ? 'https://open.larksuite.com' : 'https://open.feishu.cn'

      /**
       * Do a direct token request to avoid SDK-level token cache causing false-positive tests
       * when appSecret is changed but appId remains the same.
       */
      const tokenResponse = await axios.post(
        `${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
        {
          app_id: config.appId,
          app_secret: config.appSecret
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      )

      const tokenData = tokenResponse?.data
      if (tokenData?.code !== 0 || !tokenData?.tenant_access_token) {
        throw new Error(tokenData?.msg || 'Failed to get tenant access token from Lark API')
      }

      const botInfoResponse = await axios.get(`${baseUrl}/open-apis/bot/v3/info`, {
        headers: {
          Authorization: `Bearer ${tokenData.tenant_access_token}`
        },
        timeout: 10000
      })

      const botInfo = botInfoResponse?.data
      if (botInfo?.code !== 0 || !botInfo?.bot?.open_id) {
        throw new Error('Failed to get bot info from Lark API')
      }

      this.logger.log(`Lark connection test successful: ${botInfo.bot.app_name}`)
    } catch (error: any) {
      const axiosError = error as AxiosError<{ code?: number; msg?: string }>
      const message = axiosError?.response?.data?.msg || axiosError?.message || 'Unknown error'
      this.logger.error('Lark connection test failed:', error)
      throw new Error(`Lark API connection failed: ${message}`)
    }
  }
}
