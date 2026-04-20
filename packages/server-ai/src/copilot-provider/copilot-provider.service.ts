import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { FindManyOptions, In, IsNull, Repository } from 'typeorm'
import { CopilotProvider } from './copilot-provider.entity'

@Injectable()
export class CopilotProviderService extends TenantOrganizationAwareCrudService<CopilotProvider> {
    constructor(
        @InjectRepository(CopilotProvider)
        repository: Repository<CopilotProvider>
    ) {
        super(repository)
    }

    async findVisibleByCopilotIds(
        copilotIds: string[],
        options?: {
            tenantId?: string | null
            organizationId?: string | null
            findOptions?: Omit<FindManyOptions<CopilotProvider>, 'where'>
        }
    ): Promise<Map<string, CopilotProvider>> {
        const tenantId = options?.tenantId !== undefined ? options.tenantId : RequestContext.currentTenantId()
        const organizationId =
            options?.organizationId !== undefined ? options.organizationId : RequestContext.getOrganizationId()

        if (!tenantId || !copilotIds?.length) {
            return new Map()
        }

        const items = await this.repository.find({
            ...(options?.findOptions ?? {}),
            where: organizationId
                ? [
                      {
                          tenantId,
                          organizationId,
                          copilotId: In(copilotIds)
                      },
                      {
                          tenantId,
                          organizationId: IsNull(),
                          copilotId: In(copilotIds)
                      }
                  ]
                : [
                      {
                          tenantId,
                          organizationId: IsNull(),
                          copilotId: In(copilotIds)
                      }
                  ]
        })

        const providers = new Map<string, CopilotProvider>()
        for (const item of items) {
            if (!item?.copilotId) {
                continue
            }

            const existing = providers.get(item.copilotId)
            if (!existing || (!existing.organizationId && item.organizationId)) {
                providers.set(item.copilotId, item)
            }
        }

        return providers
    }
}
