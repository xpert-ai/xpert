import { SSOProviderRegistry, type ISSOProviderDescriptor } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { Request } from 'express'
import {
  ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY,
  AnonymousTenantResolution,
  AnonymousTenantResolverService
} from '../../tenant/anonymous-tenant-resolver.service'
import { resolveRequestBaseUrl } from './request-base-url'

export interface AuthSsoDiscoveryResult {
  fallbackApplied: boolean
  providers: ISSOProviderDescriptor[]
}

@Injectable()
export class AuthSsoDiscoveryService {
  constructor(
    private readonly anonymousTenantResolver: AnonymousTenantResolverService,
    private readonly ssoProviderRegistry: SSOProviderRegistry
  ) {}

  async discover(request: Request): Promise<AuthSsoDiscoveryResult> {
    const resolution = await this.resolveTenant(request)
    if (!resolution.tenantId) {
      return {
        fallbackApplied: resolution.fallbackApplied,
        providers: []
      }
    }

    const requestBaseUrl = resolveRequestBaseUrl(request)
    const providers = await Promise.all(
      this.ssoProviderRegistry
        .list(resolution.organizationId ?? undefined)
        .map((strategy) =>
          strategy.describe({
            tenantId: resolution.tenantId,
            organizationId: resolution.organizationId,
            requestBaseUrl
          })
        )
    )

    return {
      fallbackApplied: resolution.fallbackApplied,
      providers: providers
        .filter((provider): provider is ISSOProviderDescriptor => !!provider)
        .sort((left, right) => left.order - right.order || left.displayName.localeCompare(right.displayName))
    }
  }

  private async resolveTenant(request: Request): Promise<AnonymousTenantResolution> {
    return (
      (request[ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY] as AnonymousTenantResolution | undefined) ??
      this.anonymousTenantResolver.resolve(request)
    )
  }
}
