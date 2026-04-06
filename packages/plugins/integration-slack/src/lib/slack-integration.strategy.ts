import type {
  I18nObject,
  IIntegration,
  IntegrationFeatureEnum,
  TIntegrationProvider
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { IntegrationStrategy, IntegrationTestResult, TIntegrationStrategyParams } from '@xpert-ai/plugin-sdk'
import { IntegrationStrategyKey, RequestContext } from '@xpert-ai/plugin-sdk'
import {
  SlackIntegrationConfig,
  assertSlackAppConfig,
  buildSlackAuthorizationUrl,
  getSlackCallbackUrl,
  hydrateSlackConfig,
  normalizeSlackConfig,
  resolveSlackStateSecret
} from './slack-integration.shared'

@Injectable()
@IntegrationStrategyKey('slack')
export class SlackIntegrationStrategy implements IntegrationStrategy<SlackIntegrationConfig> {
  constructor(private readonly configService: ConfigService) {}

  readonly meta: TIntegrationProvider = {
    name: 'slack',
    label: {
      en_US: 'Slack',
      zh_Hans: 'Slack'
    },
    description: {
      en_US: 'Connect a Slack App with OAuth and expose workspace status and users as declarative extension views.',
      zh_Hans: '通过 Slack App OAuth 连接工作区，并以声明式扩展视图展示连接状态与成员列表。'
    },
    icon: {
      type: 'image',
      value: '/assets/images/destinations/slack.png'
    },
    webhook: true,
    helpUrl: 'https://api.slack.com/authentication/oauth-v2',
    features: [] as IntegrationFeatureEnum[],
    schema: {
      type: 'object',
      properties: {
        appId: {
          type: 'string',
          title: i18n('App ID', 'App ID'),
          description: i18n(
            'Slack App ID from the Basic Information page of your Slack app.',
            'Slack App 的 Basic Information 页面中的 App ID。'
          )
        },
        clientId: {
          type: 'string',
          title: i18n('Client ID', 'Client ID'),
          description: i18n(
            'OAuth Client ID from your Slack app configuration.',
            'Slack App 配置中的 OAuth Client ID。'
          )
        },
        clientSecret: {
          type: 'string',
          title: i18n('Client Secret', 'Client Secret'),
          description: i18n(
            'OAuth Client Secret from your Slack app configuration.',
            'Slack App 配置中的 OAuth Client Secret。'
          ),
          'x-ui': {
            component: 'password'
          }
        },
        signingSecret: {
          type: 'string',
          title: i18n('Signing Secret', 'Signing Secret'),
          description: i18n(
            'Signing secret used to verify Slack requests.',
            '用于校验 Slack 请求的 Signing Secret。'
          ),
          'x-ui': {
            component: 'password'
          }
        },
        verificationToken: {
          type: 'string',
          title: i18n('Verification Token', 'Verification Token'),
          description: i18n(
            'Optional legacy verification token shown in the Slack app settings.',
            'Slack App 设置里展示的旧版 Verification Token，可选。'
          ),
          'x-ui': {
            component: 'password'
          }
        },
        defaultChannelId: {
          type: 'string',
          title: i18n('Default Channel ID', '默认频道 ID'),
          description: i18n(
            'Optional default Slack channel ID to keep alongside this integration.',
            '可选，保存一个默认 Slack 频道 ID 供后续能力复用。'
          )
        }
      },
      required: ['appId', 'clientId', 'clientSecret', 'signingSecret'],
      secret: ['clientSecret', 'signingSecret', 'verificationToken', 'botToken']
    }
  }

  async execute(integration: IIntegration<SlackIntegrationConfig>, _payload: TIntegrationStrategyParams) {
    return {
      success: true,
      provider: integration.provider,
      workspace: integration.options?.workspace ?? integration.options?.teamName ?? null
    }
  }

  async validateConfig(
    config: SlackIntegrationConfig,
    integration?: IIntegration<SlackIntegrationConfig>
  ): Promise<void | IntegrationTestResult> {
    const normalized = normalizeSlackConfig(config)
    assertSlackAppConfig(normalized)
    const callbackUrl = getSlackCallbackUrl(this.configService.get('baseUrl'))
    const checkedAt = Date.now()

    const result: IntegrationTestResult & {
      name?: string
      options?: SlackIntegrationConfig
      provider?: string
      features?: IntegrationFeatureEnum[]
    } = {
      provider: 'slack',
      features: this.meta.features,
      mode: 'oauth_app',
      callbackUrl,
      options: {
        ...normalized,
        status: normalized.botToken ? normalized.status : 'pending_authorization',
        connectionStatus: normalized.botToken ? normalized.connectionStatus : 'pending_authorization'
      }
    }

    if (!integration?.name?.trim()) {
      result.name = normalized.teamName ? `${normalized.teamName} Slack` : 'Slack'
    }

    if (integration?.id) {
      result['authorizationUrl'] = this.buildAuthorizationUrl(normalized, integration.id)
    }

    if (!normalized.botToken) {
      result.warnings = [
        integration?.id
          ? 'Use Connect to Slack to authorize the app for a workspace.'
          : 'Save the integration first, then use Connect to Slack to authorize the app.'
      ]
      result.probe = {
        connected: false,
        state: 'pending_authorization',
        lastError: null,
        checkedAt
      }
      return result
    }

    try {
      const { checkedAt: connectedAt, nextOptions, warnings } = await hydrateSlackConfig(normalized)
      result.warnings = warnings
      result.probe = {
        connected: true,
        state: 'connected',
        lastError: null,
        checkedAt: connectedAt
      }
      result.options = nextOptions
    } catch (error) {
      const errorMessage = stringifyError(error)
      result.warnings = [errorMessage]
      result.probe = {
        connected: false,
        state: 'authorization_required',
        lastError: errorMessage,
        checkedAt
      }
      result.options = {
        ...normalized,
        status: 'authorization_required',
        connectionStatus: 'authorization_required'
      }
    }

    return result
  }

  private buildAuthorizationUrl(config: SlackIntegrationConfig, integrationId: string) {
    return buildSlackAuthorizationUrl(config, {
      integrationId,
      tenantId: RequestContext.currentTenantId(),
      organizationId: RequestContext.getOrganizationId(),
      baseUrl: this.configService.get('baseUrl'),
      clientBaseUrl: this.configService.get('clientBaseUrl'),
      stateSecret: resolveSlackStateSecret(
        this.configService.get('JWT_SECRET'),
        this.configService.get('secretsEncryptionKey')
      )
    }).authorizationUrl
  }
}

function i18n(en_US: string, zh_Hans: string): I18nObject {
  return {
    en_US,
    zh_Hans
  }
}

function stringifyError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
