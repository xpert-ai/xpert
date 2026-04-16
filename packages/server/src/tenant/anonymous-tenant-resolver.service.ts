import { DEFAULT_TENANT } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { Request } from 'express'
import { Tenant } from './tenant.entity'
import { TenantService } from './tenant.service'

export const ANONYMOUS_TENANT_RESOLUTION_REQUEST_KEY = 'anonymous-tenant-resolution'

export interface AnonymousTenantResolution {
  tenant: Tenant | null
  tenantId: string | null
  tenantName: string | null
  organizationId: string | null
  fallbackApplied: boolean
}

@Injectable()
export class AnonymousTenantResolverService {
  constructor(private readonly tenantService: TenantService) {}

  async resolve(request: Request): Promise<AnonymousTenantResolution> {
    const candidateSubdomain = this.readCandidateSubdomain(request)
    const primaryTenant = await this.findTenantBySubdomain(candidateSubdomain)

    if (primaryTenant) {
      return this.createResolution(primaryTenant, false)
    }

    const fallbackTenant = await this.findTenantByName(DEFAULT_TENANT)
    return this.createResolution(fallbackTenant, candidateSubdomain !== DEFAULT_TENANT)
  }

  private readCandidateSubdomain(request: Request): string | null {
    const tenantDomain = request['tenant-domain']
    return typeof tenantDomain === 'string' && tenantDomain.trim().length > 0
      ? tenantDomain.trim()
      : null
  }

  private async findTenantBySubdomain(subdomain: string | null): Promise<Tenant | null> {
    if (!subdomain) {
      return null
    }

    const result = await this.tenantService.findOneOrFailByOptions({
      where: {
        subdomain
      },
      relations: ['organizations', 'settings']
    })

    return result.success ? result.record : null
  }

  private async findTenantByName(name: string | null): Promise<Tenant | null> {
    if (!name) {
      return null
    }

    const result = await this.tenantService.findOneOrFailByOptions({
      where: {
        name
      },
      relations: ['organizations', 'settings']
    })

    return result.success ? result.record : null
  }

  private createResolution(tenant: Tenant | null, fallbackApplied: boolean): AnonymousTenantResolution {
    return {
      tenant,
      tenantId: tenant?.id ?? null,
      tenantName: tenant?.name ?? null,
      organizationId: this.selectOrganizationId(tenant),
      fallbackApplied
    }
  }

  private selectOrganizationId(tenant: Tenant | null): string | null {
    if (!tenant?.organizations?.length) {
      return null
    }

    const activeOrganizations = [...tenant.organizations]
      .filter((organization) => organization?.isActive !== false)
      .sort((left, right) => this.toTimestamp(left?.createdAt) - this.toTimestamp(right?.createdAt))

    return activeOrganizations.find((organization) => organization?.isDefault)?.id ?? activeOrganizations[0]?.id ?? null
  }

  private toTimestamp(value: Date | string | null | undefined) {
    if (!value) {
      return 0
    }
    const time = new Date(value).getTime()
    return Number.isFinite(time) ? time : 0
  }
}
