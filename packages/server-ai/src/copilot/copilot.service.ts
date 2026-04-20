import { AiProviderRole, IAiProviderEntity, ICopilot } from '@xpert-ai/contracts'
import { DeepPartial } from '@xpert-ai/server-common'
import { ConfigService } from '@xpert-ai/server-config'
import {
    FindOptionsWhere,
    PaginationParams,
    RequestContext,
    TenantOrganizationAwareCrudService
} from '@xpert-ai/server-core'
import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, compact, uniq } from 'lodash'
import { IsNull, Repository } from 'typeorm'
import { ListModelProvidersQuery } from '../ai-model'
import { GetCopilotOrgUsageQuery } from '../copilot-organization/queries'
import { CopilotProviderService } from '../copilot-provider/copilot-provider.service'
import { Copilot } from './copilot.entity'
import { CopilotDto } from './dto'

export const ProviderRolePriority = [
    AiProviderRole.Embedding,
    AiProviderRole.Secondary,
    AiProviderRole.Primary,
    AiProviderRole.Reasoning
]

@Injectable()
export class CopilotService extends TenantOrganizationAwareCrudService<Copilot> {
    @Inject(ConfigService)
    private readonly configService: ConfigService

    get baseUrl() {
        return this.configService.get('baseUrl') as string
    }

    constructor(
        @InjectRepository(Copilot)
        repository: Repository<Copilot>,

        private readonly queryBus: QueryBus,
        private readonly copilotProviderService: CopilotProviderService
    ) {
        super(repository)
    }

    /**
     * Get all available copilots in organization or tenant (if not enabled anyone in organization).
     * Fill the quota of tenant copilots for organization user
     *
     * @param filter
     */
    async findAvailables(filter?: PaginationParams<Copilot>) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const copilots = await this.findAllAvailablesCopilots()
        // Filter the tenant enabled copilots for organization user
        // copilots = copilots.filter((copilot) => (organizationId && !copilot.organizationId) ? copilot.enabled : true)
        for await (const copilot of copilots) {
            if (!copilot.organizationId) {
                const usage = await this.queryBus.execute(
                    new GetCopilotOrgUsageQuery(tenantId, organizationId, copilot.id)
                )
                copilot.usage = usage ?? {
                    tokenLimit: copilot.tokenBalance,
                    tokenUsed: 0
                }
            }
        }

        return copilots
    }

    /**
     *
     */
    // async findOneByRole(role: AiProviderRole, tenantId: string, organizationId: string): Promise<Copilot> {
    // 	const items = await this.findAllAvailablesCopilots(tenantId, organizationId, { role })
    // 	return items.length ? items[0] : null
    // }

    /**
     * Find all copilots in organization or tenant globally
     *
     * @param tenantId
     * @param organizationId
     * @returns All copilots
     */
    async findAllAvailablesCopilots(
        tenantId?: string | null,
        organizationId?: string | null,
        where?: FindOptionsWhere<Copilot>
    ) {
        tenantId = tenantId ?? RequestContext.currentTenantId()
        organizationId = organizationId ?? RequestContext.getOrganizationId()
        const items = await this.repository.find({
            where: { ...(where ?? {}), tenantId, organizationId, enabled: true },
            relations: ['modelProvider']
        })
        if (items.length) {
            return this.hydrateVisibleModelProviders(items, tenantId, organizationId)
        }

        const tenantItems = await this.repository.find({
            where: { ...(where ?? {}), tenantId, organizationId: IsNull(), enabled: true },
            relations: ['modelProvider']
        })

        return this.hydrateVisibleModelProviders(tenantItems, tenantId, organizationId)
    }

    /**
     * Insert or update by id
     *
     * @param entity
     * @returns
     */
    async upsert(entity: DeepPartial<Copilot>) {
        if (entity.id) {
            await this.update(entity.id, entity)
            return await this.findOne(entity.id)
        } else {
            return await this.create(entity)
        }
    }

    async update(id: string, entity: DeepPartial<ICopilot>) {
        const copilot = await this.findOne(id)
        assign(copilot, entity)
        return await this.repository.save(copilot)
    }

    /**
     * Find all copilots
     */
    async findAllCopilots(params: PaginationParams<Copilot>) {
        const result = await this.findAll(params)
        const items = await this.hydrateVisibleModelProviders(result.items)

        const providers = await this.queryBus.execute<ListModelProvidersQuery, IAiProviderEntity[]>(
            new ListModelProvidersQuery(compact(uniq(items.map((item) => item.modelProvider?.providerName))))
        )

        return {
            ...result,
            items: items.map(
                (item) =>
                    new CopilotDto(
                        {
                            ...item,
                            modelProvider: item.modelProvider
                                ? {
                                      ...item.modelProvider,
                                      provider: providers.find((_) => _.provider === item.modelProvider.providerName)
                                  }
                                : null
                        },
                        this.baseUrl
                    )
            )
        }
    }

    private async hydrateVisibleModelProviders(
        copilots: Copilot[],
        tenantId = RequestContext.currentTenantId(),
        organizationId = RequestContext.getOrganizationId()
    ) {
        if (!copilots?.length || !tenantId) {
            return copilots
        }

        const providerByCopilotId = await this.copilotProviderService.findVisibleByCopilotIds(
            copilots.map((copilot) => copilot.id),
            { tenantId, organizationId }
        )

        return copilots.map((copilot) => ({
            ...copilot,
            modelProvider: providerByCopilotId.get(copilot.id) ?? null
        }))
    }
}
