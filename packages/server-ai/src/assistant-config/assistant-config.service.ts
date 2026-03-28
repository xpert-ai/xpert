import {
  AssistantCode,
  AssistantConfigScope,
  AssistantConfigSourceScope,
  IAssistantConfigUpsertInput,
  IResolvedAssistantConfig,
  RolesEnum
} from '@metad/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import {
  BadRequestException,
  ForbiddenException,
  Injectable
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, IsNull, Repository } from 'typeorm'
import { AssistantConfig } from './assistant-config.entity'

@Injectable()
export class AssistantConfigService extends TenantOrganizationAwareCrudService<AssistantConfig> {
  constructor(
    @InjectRepository(AssistantConfig)
    repository: Repository<AssistantConfig>
  ) {
    super(repository)
  }

  async getScopedConfigs(scope: AssistantConfigScope) {
    const tenantId = this.requireTenantId()
    const organizationId =
      scope === AssistantConfigScope.ORGANIZATION ? RequestContext.getOrganizationId() : null

    if (scope === AssistantConfigScope.ORGANIZATION && !organizationId) {
      return []
    }

    return this.repository.find({
      where: {
        tenantId,
        organizationId: organizationId ?? IsNull()
      },
      order: {
        code: 'ASC'
      }
    })
  }

  async getEffectiveConfig(code: AssistantCode): Promise<IResolvedAssistantConfig> {
    const tenantId = this.requireTenantId()
    const organizationId = RequestContext.getOrganizationId()

    if (organizationId) {
      const organizationConfig = await this.repository.findOne({
        where: {
          tenantId,
          organizationId,
          code
        }
      })
      if (organizationConfig) {
        return this.toResolvedConfig(organizationConfig, AssistantConfigSourceScope.ORGANIZATION)
      }
    }

    const tenantConfig = await this.repository.findOne({
      where: {
        tenantId,
        organizationId: IsNull(),
        code
      }
    })

    if (tenantConfig) {
      return this.toResolvedConfig(tenantConfig, AssistantConfigSourceScope.TENANT)
    }

    return {
      code,
      enabled: false,
      options: null,
      tenantId,
      organizationId: organizationId ?? null,
      sourceScope: AssistantConfigSourceScope.NONE
    }
  }

  async upsertConfig(input: IAssistantConfigUpsertInput) {
    this.ensureWriteAccess(input.scope)

    const tenantId = this.requireTenantId()
    const organizationId = this.resolveOrganizationId(input.scope)
    const existing = await this.findByScope(input.code, input.scope)
    const userId = RequestContext.currentUserId()

    if (existing) {
      existing.enabled = input.enabled
      existing.options = input.options ?? null
      existing.updatedBy = userId ? ({ id: userId } as any) : existing.updatedBy
      return this.repository.save(existing)
    }

    const entity = this.repository.create({
      code: input.code,
      enabled: input.enabled,
      options: input.options ?? null,
      tenant: { id: tenantId },
      tenantId,
      organization: organizationId ? ({ id: organizationId } as any) : null,
      organizationId: organizationId ?? null,
      createdBy: userId ? ({ id: userId } as any) : undefined,
      updatedBy: userId ? ({ id: userId } as any) : undefined
    } as DeepPartial<AssistantConfig>)

    return this.repository.save(entity)
  }

  async deleteConfig(code: AssistantCode, scope: AssistantConfigScope) {
    this.ensureWriteAccess(scope)

    const tenantId = this.requireTenantId()
    const organizationId = this.resolveOrganizationId(scope)

    return this.repository.delete({
      tenantId,
      organizationId: organizationId ?? IsNull(),
      code
    })
  }

  private async findByScope(code: AssistantCode, scope: AssistantConfigScope) {
    const tenantId = this.requireTenantId()
    const organizationId = this.resolveOrganizationId(scope)

    return this.repository.findOne({
      where: {
        tenantId,
        organizationId: organizationId ?? IsNull(),
        code
      }
    })
  }

  private ensureWriteAccess(scope: AssistantConfigScope) {
    if (scope === AssistantConfigScope.TENANT) {
      if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) {
        throw new ForbiddenException('Tenant assistant configuration requires super admin access.')
      }
      return
    }

    if (!RequestContext.hasRoles([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN])) {
      throw new ForbiddenException('Organization assistant configuration requires admin access.')
    }
  }

  private requireTenantId() {
    const tenantId = RequestContext.currentTenantId()
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required.')
    }
    return tenantId
  }

  private resolveOrganizationId(scope: AssistantConfigScope) {
    if (scope === AssistantConfigScope.TENANT) {
      return null
    }

    const organizationId = RequestContext.getOrganizationId()
    if (!organizationId) {
      throw new BadRequestException('Organization context is required for organization assistant configuration.')
    }

    return organizationId
  }

  private toResolvedConfig(config: AssistantConfig, sourceScope: AssistantConfigSourceScope): IResolvedAssistantConfig {
    return {
      ...config,
      sourceScope
    }
  }
}
