import { AiProviderRole, ICopilot } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IsNull, Repository } from 'typeorm'
import { Copilot } from './copilot.entity'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { assign } from 'lodash'
import { GetCopilotOrgUsageQuery } from '../copilot-organization/queries'

export const ProviderRolePriority = [AiProviderRole.Embedding, AiProviderRole.Secondary, AiProviderRole.Primary]

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
		const copilots = await this.findAllCopilots()
		// Filter the tenant enabled copilots for organization user
		// copilots = copilots.filter((copilot) => (organizationId && !copilot.organizationId) ? copilot.enabled : true)
		for await (const copilot of copilots) {
			if (!copilot.organizationId) {
				const usage = await this.queryBus.execute(new GetCopilotOrgUsageQuery(tenantId, organizationId, copilot.id))
				copilot.usage = usage ?? {
					tokenLimit: copilot.tokenBalance,
					tokenUsed: 0
				}
			}
		}
		
		return copilots
	}

	/**
	 */
	async findOneByRole(role: string, tenantId: string, organizationId: string): Promise<Copilot> {
		tenantId = tenantId || RequestContext.currentTenantId()
		organizationId = organizationId || RequestContext.getOrganizationId()
		const items = await this.repository.find({ where: { tenantId, organizationId, role }, relations: ['modelProvider'] })
		return items.length ? items[0] : null
	}

	/**
	 */
	async findTenantOneByRole(role: string, tenantId: string): Promise<Copilot> {
		tenantId = tenantId || RequestContext.currentTenantId()
		const items = await this.repository.find({ where: { tenantId, role, organizationId: IsNull() } })
		return items.length ? items[0] : null
	}

	async findCopilot(tenantId: string, organizationId: string, role?: AiProviderRole) {
		tenantId = tenantId || RequestContext.currentTenantId()
		organizationId = organizationId || RequestContext.getOrganizationId()
		role = role ?? AiProviderRole.Secondary
		let copilot: ICopilot = null
		for (const priorityRole of ProviderRolePriority.slice(ProviderRolePriority.indexOf(role))) {
			copilot = await this.findOneByRole(priorityRole, tenantId, organizationId)
			if (copilot?.enabled) {
				break
			}
		}
		// 没有配置过 org 内的 copilot（包括又禁用的情况） 则使用 Tenant 全局配置
		if (!copilot?.enabled) {
			for (const priorityRole of ProviderRolePriority.slice(ProviderRolePriority.indexOf(role))) {
				copilot = await this.findTenantOneByRole(priorityRole, tenantId)
				if (copilot?.enabled) {
					break
				}
			}
		}
	
		return copilot
	}

	/**
	 * Find all copilots in organization or tenant globally
	 * 
	 * @param tenantId
	 * @param organizationId 
	 * @returns All copilots
	 */
	async findAllCopilots(tenantId?: string, organizationId?: string, params?: PaginationParams<Copilot>) {
		tenantId = tenantId || RequestContext.currentTenantId()
		organizationId = organizationId || RequestContext.getOrganizationId()
		const items = await this.repository.find({ where: { tenantId, organizationId, enabled: true }, relations: ['modelProvider'] })
		if (items.length) {
			return items
		}

		return await this.repository.find({ where: { tenantId, organizationId: IsNull(), enabled: true }, relations: ['modelProvider'] })
	}

	/**
	 * Insert or update by id or role
	 *
	 * @param entity
	 * @returns
	 */
	async upsert(entity: DeepPartial<Copilot>) {
		if (entity.id) {
			await this.update(entity.id, entity)
		} else {
			const record = await this.findOneByRole(entity.role, null, null)
			if (record) {
				await this.update(record.id, entity)
				entity.id = record.id
			} else {
				entity = await this.create(entity)
			}
		}
		return await this.findOne(entity.id)
	}
	
	async update(id: string, entity: DeepPartial<ICopilot>) {
		const copilot = await this.findOne(id)
		assign(copilot, entity)
		return await this.repository.save(copilot)
	}
}
