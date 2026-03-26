import { IIntegration, INTEGRATION_PROVIDERS } from '@metad/contracts'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IntegrationRuntimeView, IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { DeepPartial, DeleteResult, FindOneOptions, FindOptionsWhere, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { TenantOrganizationAwareCrudService } from './../core/crud'
import { Integration } from './integration.entity'

@Injectable()
export class IntegrationService extends TenantOrganizationAwareCrudService<Integration> {
  private readonly logger = new Logger(IntegrationService.name)

	constructor(
		@InjectRepository(Integration)
		integrationRepository: Repository<Integration>,
		private readonly strategyRegistry: IntegrationStrategyRegistry,
	) {
		super(integrationRepository)
	}

	getProviders() {
		const providers = new Map<string, any>()

		for (const provider of Object.values(INTEGRATION_PROVIDERS)) {
			providers.set(provider.name, provider)
		}

		// Prefer plugin-registered strategies when they override a builtin provider
		for (const provider of this.strategyRegistry.list(RequestContext.getOrganizationId()).map((strategy) => strategy.meta)) {
			providers.set(provider.name, provider)
		}

		return Array.from(providers.values())
	}

	getIntegrationStrategy(type: string) {
		return this.strategyRegistry.get(type, RequestContext.getOrganizationId())
	}

	async test(integration: IIntegration) {
		const strategy = this.getIntegrationStrategy(integration.provider)
		return strategy.validateConfig(integration.options, integration)
	}

	async create(entity: DeepPartial<Integration>, ...options: any[]) {
		const created = await super.create(entity, ...options)
		const strategy = this.getIntegrationStrategy(created.provider)
		if (!strategy?.onCreate) {
			return created
		}

		try {
			await strategy.onCreate(created as unknown as IIntegration)
		} catch (error) {
			this.logger.warn(
				`Post-create integration hook failed for ${created.id ?? 'unknown'}: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}

		return created
	}

	async update(
		id: string | number | FindOptionsWhere<Integration>,
		partialEntity: QueryDeepPartialEntity<Integration>,
		...options: any[]
	) {
		const integrationId =
			typeof id === 'string' ? id : typeof id === 'number' ? String(id) : (id as { id?: string })?.id
		const previous = integrationId ? await this.readOneById(integrationId) : null
		const result = await super.update(id, partialEntity, ...options)

		if (!previous) {
			return result
		}

		const strategy = this.getIntegrationStrategy(previous.provider)
		if (!strategy?.onUpdate) {
			return result
		}

		try {
			await strategy.onUpdate(previous as unknown as IIntegration, this.mergeUpdatedIntegration(previous, partialEntity))
		} catch (error) {
			this.logger.warn(
				`Post-update integration hook failed for ${integrationId ?? 'unknown'}: ${
					error instanceof Error ? error.message : String(error)
				}`
			)
		}

		return result
	}

	async delete(criteria: string | FindOptionsWhere<Integration>, options?: FindOneOptions<Integration>): Promise<DeleteResult> {
		const integrationId = this.resolveIntegrationId(criteria)
		if (integrationId) {
			const integration = await this.readOneById(integrationId, { relations: ['tenant'] })
			if (integration) {
				const strategy = this.getIntegrationStrategy(integration.provider)
				await strategy?.onDelete?.(integration as unknown as IIntegration)
			}
		}

		return super.delete(criteria, options)
	}

	async getRuntimeView(id: string): Promise<IntegrationRuntimeView> {
		const integration = await this.readOneById(id, { relations: ['tenant'] })
		if (!integration) {
			throw new NotFoundException(`Integration ${id} not found`)
		}

		const strategy = this.getIntegrationStrategy(integration.provider)
		if (!strategy?.getRuntimeView) {
			return {
				supported: false,
				sections: []
			}
		}

		return strategy.getRuntimeView(integration as unknown as IIntegration)
	}

	async runRuntimeAction(id: string, action: string, payload?: unknown): Promise<IntegrationRuntimeView> {
		const integration = await this.readOneById(id, { relations: ['tenant'] })
		if (!integration) {
			throw new NotFoundException(`Integration ${id} not found`)
		}

		const strategy = this.getIntegrationStrategy(integration.provider)
		if (!strategy?.runRuntimeAction) {
			throw new BadRequestException(`Runtime action "${action}" is not supported for provider "${integration.provider}"`)
		}

		return strategy.runRuntimeAction(integration as unknown as IIntegration, action, payload)
	}

	readOneById(id: string, options?: FindOneOptions<Integration>) {
		return this.repository.findOne({ ...(options ?? {}), where: { id } })
	}

	private mergeUpdatedIntegration(
		previous: Integration,
		partialEntity: QueryDeepPartialEntity<Integration>
	): IIntegration<any> {
		const next = {
			...previous,
			...partialEntity
		} as Integration

		if ('options' in partialEntity && partialEntity.options && typeof partialEntity.options === 'object') {
			next.options = {
				...(previous.options ?? {}),
				...(partialEntity.options as Record<string, unknown>)
			} as any
		}

		return next as unknown as IIntegration<any>
	}

	private resolveIntegrationId(id: string | number | FindOptionsWhere<Integration>): string | undefined {
		if (typeof id === 'string') {
			return id
		}

		if (typeof id === 'number') {
			return String(id)
		}

		return (id as { id?: string })?.id
	}
}
