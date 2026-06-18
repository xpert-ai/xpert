import type { IApiPrincipal } from '@xpert-ai/contracts'
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
  UnauthorizedException
} from '@nestjs/common'

export const PLUGIN_WEBHOOK_AUTH_METADATA_KEY = 'xpert:plugin:webhook-auth'
export const PLUGIN_WEBHOOK_AUTH_SERVICE_TOKEN = 'XPERT_PLUGIN_WEBHOOK_AUTH_SERVICE'

export type PluginWebhookAuthMetadata = {
  provider?: string
  integrationParam?: string
  secretQueryParam?: string
}

export type PluginWebhookCredentialRecord = {
  id: string
  tokenHash: string
  tokenPrefix?: string
  createdAt: string
  rotatedAt?: string | null
  revokedAt?: string | null
}

export type PluginWebhookCredentialResult = {
  token: string
  credential: PluginWebhookCredentialRecord
}

export type PluginWebhookAuthRequest = {
  integrationId: string
  secret: string
  provider?: string | null
}

export type PluginWebhookAuthResult = {
  user: IApiPrincipal
  headers: Record<string, string>
}

export interface PluginWebhookAuthService {
  validateWebhookSecret(input: PluginWebhookAuthRequest): Promise<PluginWebhookAuthResult | null>
}

export function PluginWebhookAuth(metadata: PluginWebhookAuthMetadata = {}) {
  return SetMetadata(PLUGIN_WEBHOOK_AUTH_METADATA_KEY, {
    integrationParam: 'id',
    secretQueryParam: 'secret',
    ...metadata
  } satisfies Required<Pick<PluginWebhookAuthMetadata, 'integrationParam' | 'secretQueryParam'>> &
    PluginWebhookAuthMetadata)
}

type RequestLike = {
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  headers?: Record<string, unknown>
  user?: unknown
}

@Injectable()
export class PluginWebhookAuthGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(PLUGIN_WEBHOOK_AUTH_SERVICE_TOKEN)
    private readonly authService?: PluginWebhookAuthService | null
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.resolveMetadata(context)
    if (!metadata) {
      return true
    }

    const request = context.switchToHttp().getRequest<RequestLike>()
    const integrationParam = metadata.integrationParam || 'id'
    const secretQueryParam = metadata.secretQueryParam || 'secret'
    const integrationId = this.getString(request.params?.[integrationParam])
    const secret = this.getString(request.query?.[secretQueryParam])
    if (!integrationId || !secret) {
      throw new UnauthorizedException('Plugin webhook secret is required')
    }

    const authService = this.authService
    if (!authService) {
      throw new UnauthorizedException('Plugin webhook auth service is not available')
    }

    const principalContext = await authService.validateWebhookSecret({
      integrationId,
      secret,
      provider: metadata.provider
    })
    if (!principalContext?.user || !principalContext.headers) {
      throw new UnauthorizedException('Plugin webhook secret is invalid')
    }

    request.user = principalContext.user
    request.headers = {
      ...(request.headers ?? {}),
      ...principalContext.headers
    }
    return true
  }

  private resolveMetadata(context: ExecutionContext): PluginWebhookAuthMetadata | null {
    return (
      Reflect.getMetadata(PLUGIN_WEBHOOK_AUTH_METADATA_KEY, context.getHandler()) ??
      Reflect.getMetadata(PLUGIN_WEBHOOK_AUTH_METADATA_KEY, context.getClass()) ??
      null
    )
  }

  private getString(value: unknown): string {
    if (typeof value !== 'string') {
      return ''
    }
    return value.trim()
  }
}
