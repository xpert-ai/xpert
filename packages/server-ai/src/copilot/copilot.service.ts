import { AiProviderRole, ICopilot } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import {
	FindOptionsWhere,
	PaginationParams,
	RequestContext,
	TenantOrganizationAwareCrudService
} from '@metad/server-core'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { IsNull, Repository } from 'typeorm'
import { GetCopilotOrgUsageQuery } from '../copilot-organization/queries'
import { Copilot } from './copilot.entity'

export const ProviderRolePriority = [AiProviderRole.Embedding, AiProviderRole.Secondary, AiProviderRole.Primary, AiProviderRole.Reasoning]

@Injectable()
export class CopilotService extends TenantOrganizationAwareCrudService<Copilot> {
	constructor(
		@InjectRepository(Copilot)
		repository: Repository<Copilot>,

		private readonly queryBus: QueryBus
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
	async findOneByRole(role: AiProviderRole, tenantId: string, organizationId: string): Promise<Copilot> {
		const items = await this.findAllAvailablesCopilots(tenantId, organizationId, { role })
		return items.length ? items[0] : null
	}

	/**
	 * Find all copilots in organization or tenant globally
	 *
	 * @param tenantId
	 * @param organizationId
	 * @returns All copilots
	 */
	async findAllAvailablesCopilots(tenantId?: string, organizationId?: string, where?: FindOptionsWhere<Copilot>) {
		tenantId = tenantId || RequestContext.currentTenantId()
		organizationId = organizationId || RequestContext.getOrganizationId()
		const items = await this.repository.find({
			where: { ...(where ?? {}), tenantId, organizationId, enabled: true },
			relations: ['modelProvider']
		})
		if (items.length) {
			return items
		}

		return await this.repository.find({
			where: { ...(where ?? {}), tenantId, organizationId: IsNull(), enabled: true },
			relations: ['modelProvider']
		})
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
}
