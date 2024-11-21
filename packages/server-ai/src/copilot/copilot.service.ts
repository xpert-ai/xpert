import { AiProviderRole, ICopilot } from '@metad/contracts'
import { DeepPartial } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { Copilot } from './copilot.entity'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'

export const ProviderRolePriority = [AiProviderRole.Embedding, AiProviderRole.Secondary, AiProviderRole.Primary]

@Injectable()
export class CopilotService extends TenantOrganizationAwareCrudService<Copilot> {
	constructor(
		@InjectRepository(Copilot)
		repository: Repository<Copilot>
	) {
		super(repository)
	}

	async findAvalibles(filter?: PaginationParams<Copilot>) {
		const { items, total } = await super.findAll(filter)
		if (items.some((item) => item.enabled)) {
			return { items, total }
		}
		return await super.findAllWithoutOrganization()
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
		if (!copilot) {
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
	async findAllCopilots(tenantId: string, organizationId: string) {
		tenantId = tenantId || RequestContext.currentTenantId()
		organizationId = organizationId || RequestContext.getOrganizationId()
		const items = await this.repository.find({ where: { tenantId, organizationId }, relations: ['modelProvider'] })
		if (items.length) {
			return items
		}
		return await this.repository.find({ where: { tenantId, organizationId: IsNull() }, relations: ['modelProvider'] })
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
	
}
