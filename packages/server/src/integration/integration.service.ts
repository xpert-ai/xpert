import { IIntegration, INTEGRATION_PROVIDERS, IUser } from '@metad/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IntegrationStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { FindOneOptions, Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from './../core/crud'
import { UserService } from '../user'
import { Integration } from './integration.entity'

@Injectable()
export class IntegrationService extends TenantOrganizationAwareCrudService<Integration> {
	constructor(
		@InjectRepository(Integration)
		integrationRepository: Repository<Integration>,
		private readonly strategyRegistry: IntegrationStrategyRegistry,
		private readonly userService: UserService
	) {
		super(integrationRepository)
	}

	getProviders() {
		const providers = [
			...Object.values(INTEGRATION_PROVIDERS),
			...this.strategyRegistry.list(RequestContext.getOrganizationId()).map((strategy) => strategy.meta)
		]
		return providers
	}

	getIntegrationStrategy(type: string) {
		return this.strategyRegistry.get(type, RequestContext.getOrganizationId())
	}

	async test(integration: IIntegration) {
		const strategy = this.getIntegrationStrategy(integration.provider)
		return strategy.validateConfig(integration.options, integration)
	}

	async runStrategyUpdateHook(previous: IIntegration, current: IIntegration) {
		const strategy = previous?.provider ? this.getIntegrationStrategy(previous.provider) : null

		try {
			if (previous?.provider !== current?.provider) {
				await strategy?.onDelete?.(previous)
				return
			}

			await strategy?.onUpdate?.(previous, current)
		} catch (error) {
			throw new BadRequestException(error instanceof Error ? error.message : String(error))
		}
	}

	async runStrategyDeleteHook(integration: IIntegration) {
		const strategy = integration?.provider ? this.getIntegrationStrategy(integration.provider) : null

		try {
			await strategy?.onDelete?.(integration)
		} catch (error) {
			throw new BadRequestException(error instanceof Error ? error.message : String(error))
		}
	}

	readOneById(id: string, options?: FindOneOptions<Integration>) {
		return this.repository.findOne({ ...(options ?? {}), where: { id } })
	}

	async findOneByIdWithinTenant(id: string, tenantId: string, options?: Omit<FindOneOptions<Integration>, 'where'>) {
		const integration = await this.repository.findOne({
			...(options ?? {}),
			where: {
				id,
				tenantId
			}
		})

		if (!integration) {
			throw new NotFoundException(`Not found integration '${id}' in current tenant`)
		}

		return integration
	}

	async ensurePrincipalUser(
		integrationOrId: string | (Partial<IIntegration> & { id: string; tenantId: string; organizationId?: string | null })
	): Promise<IUser> {
		const integration =
			typeof integrationOrId === 'string'
				? await this.findOneByIdWithinTenant(integrationOrId, RequestContext.getScope().tenantId, {
						relations: ['user']
					})
				: integrationOrId

		if (integration.user) {
			return integration.user
		}

		if (integration.userId) {
			try {
				const user = await this.userService.findOneByIdWithinTenant(integration.userId, integration.tenantId, {
					relations: ['role', 'role.rolePermissions', 'employee']
				})
				integration.user = user
				return user
			} catch {
				//
			}
		}

		const user = await this.userService.ensureCommunicationUser({
			tenantId: integration.tenantId,
			thirdPartyId: `integration:${integration.id}`,
			username: integration.slug || integration.name || integration.id
		})

		if (integration.userId !== user.id) {
			await this.repository.save(
				this.repository.create({
					id: integration.id,
					tenantId: integration.tenantId,
					organizationId: integration.organizationId ?? null,
					user: { id: user.id } as any
				})
			)
		}

		integration.userId = user.id
		integration.user = user

		return user
	}
}
