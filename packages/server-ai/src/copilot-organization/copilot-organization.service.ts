import { ICopilotOrganization } from '@xpert-ai/contracts'
import { RequestContext, TenantAwareCrudService } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { CopilotOrganization } from './copilot-organization.entity'

@Injectable()
export class CopilotOrganizationService extends TenantAwareCrudService<CopilotOrganization> {
    readonly #logger = new Logger(CopilotOrganizationService.name)

    constructor(
        @InjectRepository(CopilotOrganization)
        repository: Repository<CopilotOrganization>,
        private readonly commandBus: CommandBus
    ) {
        super(repository)
    }

    /**
     * Upsert copilot oranization token usage by key (tenantId, organizationId, copilotId)
     *
     * @param input
     * @returns
     */
    async upsert(input: Partial<CopilotOrganization>): Promise<ICopilotOrganization> {
        const existing = await this.findOneOrFailByOptions({
            where: {
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                copilotId: input.copilotId ?? IsNull(),
                provider: input.provider,
                model: input.model,
                currency: input.currency ?? IsNull()
            }
        })
        if (existing.success) {
            existing.record.tokenUsed = (existing.record.tokenUsed ?? 0) + (input.tokenUsed ?? 0)
            existing.record.priceUsed = Number(existing.record.priceUsed ?? 0) + Number(input.priceUsed ?? 0)
            existing.record.tokenLimit ??= input.tokenLimit
            existing.record.currency ??= input.currency
            return await this.repository.save(existing.record)
        } else {
            return await this.create({
                tenantId: input.tenantId,
                organizationId: input.organizationId,
                copilotId: input.copilotId,
                provider: input.provider,
                model: input.model,
                tokenUsed: input.tokenUsed ?? 0,
                tokenLimit: input.tokenLimit,
                priceUsed: Number(input.priceUsed ?? 0),
                priceLimit: input.priceLimit,
                currency: input.currency
            })
        }
    }

    async getUsageSummary(input: {
        tenantId: string
        organizationId?: string | null
        provider: string
        model?: string | null
    }) {
        const query = this.repository
            .createQueryBuilder('copilot_organization')
            .select('COALESCE(SUM(copilot_organization.tokenUsed), 0)', 'tokenUsed')
            .addSelect('COALESCE(SUM(copilot_organization.priceUsed), 0)', 'priceUsed')
            .addSelect('MAX(copilot_organization.tokenLimit)', 'tokenLimit')
            .addSelect('MAX(copilot_organization.priceLimit)', 'priceLimit')
            .where('copilot_organization.tenantId = :tenantId', { tenantId: input.tenantId })
            .andWhere('copilot_organization.provider = :provider', { provider: input.provider })

        if (input.organizationId) {
            query.andWhere('copilot_organization.organizationId = :organizationId', {
                organizationId: input.organizationId
            })
        } else {
            query.andWhere('copilot_organization.organizationId IS NULL')
        }

        if (input.model) {
            query.andWhere('copilot_organization.model = :model', { model: input.model })
        } else {
            query.andWhere('copilot_organization.model IS NULL')
        }

        const result = await query.getRawOne<{
            tokenUsed?: string
            priceUsed?: string
            tokenLimit?: string
            priceLimit?: string
        }>()

        return {
            tokenUsed: Number(result?.tokenUsed ?? 0),
            priceUsed: Number(result?.priceUsed ?? 0),
            tokenLimit:
                result?.tokenLimit !== null && result?.tokenLimit !== undefined ? Number(result.tokenLimit) : null,
            priceLimit:
                result?.priceLimit !== null && result?.priceLimit !== undefined ? Number(result.priceLimit) : null
        }
    }

    async renew(id: string, entity: Partial<ICopilotOrganization>) {
        const record = await this.findOne(id, {
            where: {
                tenantId: RequestContext.currentTenantId()
            }
        })
        record.tokenTotalUsed += record.tokenUsed
        record.priceTotalUsed = Number(record.priceTotalUsed ?? 0) + Number(record.priceUsed ?? 0)
        record.tokenUsed = 0
        record.priceUsed = 0
        record.tokenLimit = entity.tokenLimit
        record.priceLimit = entity.priceLimit
        return await this.repository.save(record)
    }
}
