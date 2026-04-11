import type { IIntegration } from '@xpert-ai/contracts'
import { Controller, Get, Logger, Query, Res, SetMetadata } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ModuleRef } from '@nestjs/core'
import { VIEW_EXTENSION_CACHE_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import {
  exchangeSlackOAuthCode,
  normalizeSlackConfig,
  parseSlackOAuthState,
  resolveSlackStateSecret
} from './slack-integration.shared'

const Public = () => SetMetadata('isPublic', true)

@Controller('slack')
export class SlackIntegrationController {
  private readonly logger = new Logger(SlackIntegrationController.name)

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef
  ) {}

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() response: Response
  ) {
    const defaultRedirectUrl = this.getDefaultRedirectUrl()

    if (!state) {
      return response.redirect(this.appendSlackAuthResult(defaultRedirectUrl, 'error', 'Missing Slack OAuth state'))
    }

    let oauthState = null
    try {
      oauthState = parseSlackOAuthState(state, this.getStateSecret())
    } catch (stateError) {
      const message = stateError instanceof Error ? stateError.message : String(stateError)
      this.logger.warn(`Slack OAuth state validation failed: ${message}`)
      return response.redirect(this.appendSlackAuthResult(defaultRedirectUrl, 'error', message))
    }

    const redirectUrl = oauthState.redirectUri || defaultRedirectUrl

    if (error) {
      const message = errorDescription || error
      return response.redirect(this.appendSlackAuthResult(redirectUrl, 'error', message))
    }

    if (!code) {
      return response.redirect(this.appendSlackAuthResult(redirectUrl, 'error', 'Missing Slack OAuth code'))
    }

    try {
      const integration = await this.findIntegration(oauthState.integrationId, oauthState.tenantId)

      if (!integration) {
        throw new Error(`Slack integration "${oauthState.integrationId}" was not found`)
      }

      if (oauthState.organizationId && integration.organizationId !== oauthState.organizationId) {
        throw new Error('Slack integration organization does not match the OAuth state')
      }

      if (integration.provider !== 'slack') {
        throw new Error(`Integration "${integration.id}" is not a Slack integration`)
      }

      const currentOptions = normalizeSlackConfig(integration.options)
      const { nextOptions } = await exchangeSlackOAuthCode(currentOptions, code, this.getCallbackUrl())

      await this.dataSource
        .createQueryBuilder()
        .update('integration')
        .set({
          options: nextOptions,
          updatedAt: () => 'CURRENT_TIMESTAMP'
        })
        .where('id = :id', { id: integration.id })
        .andWhere('"tenantId" = :tenantId', { tenantId: oauthState.tenantId })
        .execute()

      await this.invalidateIntegrationViewCache({
        tenantId: oauthState.tenantId,
        organizationId: integration.organizationId ?? oauthState.organizationId ?? null,
        hostType: 'integration',
        hostId: integration.id
      })

      return response.redirect(this.appendSlackAuthResult(redirectUrl, 'success'))
    } catch (callbackError) {
      const message = callbackError instanceof Error ? callbackError.message : String(callbackError)
      this.logger.error(`Slack OAuth callback failed: ${message}`)
      return response.redirect(this.appendSlackAuthResult(redirectUrl, 'error', message))
    }
  }

  private getStateSecret() {
    return resolveSlackStateSecret(this.configService.get('JWT_SECRET'), this.configService.get('secretsEncryptionKey'))
  }

  private getCallbackUrl() {
    const baseUrl = this.configService.get<string>('baseUrl')
    if (!baseUrl) {
      throw new Error('Server baseUrl is not configured for Slack OAuth')
    }

    return new URL('/api/slack/callback', baseUrl).toString()
  }

  private getDefaultRedirectUrl() {
    const clientBaseUrl = this.configService.get<string>('clientBaseUrl')
    if (!clientBaseUrl) {
      throw new Error('Client base URL is not configured for Slack OAuth')
    }

    return new URL('/settings/integration', clientBaseUrl).toString()
  }

  private appendSlackAuthResult(targetUrl: string, status: 'success' | 'error', errorMessage?: string) {
    const url = new URL(targetUrl)
    url.searchParams.set('slackAuth', status)
    if (status === 'error' && errorMessage) {
      url.searchParams.set('slackError', errorMessage)
    } else {
      url.searchParams.delete('slackError')
    }
    return url.toString()
  }

  private async findIntegration(id: string, tenantId: string) {
    const integration = await this.dataSource
      .createQueryBuilder()
      .select('integration.id', 'id')
      .addSelect('integration.provider', 'provider')
      .addSelect('integration.options', 'options')
      .addSelect('integration."organizationId"', 'organizationId')
      .from('integration', 'integration')
      .where('integration.id = :id', { id })
      .andWhere('integration."tenantId" = :tenantId', { tenantId })
      .getRawOne<SlackIntegrationRecord>()

    if (!integration) {
      return null
    }

    return {
      id: integration.id,
      provider: integration.provider,
      organizationId: integration.organizationId ?? null,
      options: parseIntegrationOptions(integration.options)
    }
  }

  private async invalidateIntegrationViewCache(identity: SlackViewCacheIdentity) {
    try {
      const token = getViewExtensionCacheToken()
      if (!token) {
        return
      }

      const cacheService = this.moduleRef.get<SlackViewCacheService>(token, { strict: false })
      await cacheService?.invalidateHostIdentity(identity)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Slack view cache invalidation skipped: ${message}`)
    }
  }
}

type SlackIntegrationRecord = {
  id: string
  provider: string
  organizationId?: string | null
  options?: unknown
}

type SlackViewCacheIdentity = {
  tenantId: string
  organizationId?: string | null
  hostType: string
  hostId: string
}

type SlackViewCacheService = {
  invalidateHostIdentity(identity: SlackViewCacheIdentity): Promise<void>
}

function parseIntegrationOptions(value: unknown): IIntegration['options'] {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isObject(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  return isObject(value) ? value : null
}

function getViewExtensionCacheToken(): string | symbol | Function | null {
  return VIEW_EXTENSION_CACHE_SERVICE_TOKEN
}

function isObject(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
