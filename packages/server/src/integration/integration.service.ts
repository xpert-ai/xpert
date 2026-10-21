import { IIntegration, IntegrationFeatureEnum, IUser } from '@xpert-ai/contracts'
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
		return this.strategyRegistry.list(RequestContext.getOrganizationId()).map((strategy) => strategy.meta)
	}

	getIntegrationStrategy(type: string, organizationId?: string | null) {
		return this.strategyRegistry.get(type, organizationId ?? RequestContext.getOrganizationId())
	}

	private resolveOptionalIntegrationStrategy(provider: string) {
		return this.strategyRegistry.listRegistrations().find(({ type }) => type === provider)?.strategy
	}

	async applyStrategyValidation<T extends Partial<IIntegration>>(
		integration: T,
		previous?: IIntegration
	): Promise<T> {
		if (!integration.provider) {
			return integration
		}

		const strategy = this.resolveOptionalIntegrationStrategy(integration.provider)

		if (!strategy) {
			return integration
		}

		try {
			const prepared = strategy.prepareConfig
				? {
						...integration,
						options: await strategy.prepareConfig(
							integration.options,
							previous?.provider === integration.provider ? previous.options : undefined
						)
					}
				: integration
			const result = await strategy.validateConfig?.(prepared.options, prepared as IIntegration)
			return {
				...prepared,
				...pickValidatedIntegrationPatch(result)
			}
		} catch (error) {
			throw new BadRequestException(error instanceof Error ? error.message : String(error))
		}
	}

	async test(integration: IIntegration) {
		const strategy = this.getIntegrationStrategy(integration.provider)
		return strategy.validateConfig(integration.options, integration)
	}

	async runStrategyUpdateHook(previous: IIntegration, current: IIntegration) {
		const strategy = previous?.provider ? this.resolveOptionalIntegrationStrategy(previous.provider) : null

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
		const strategy = integration?.provider ? this.resolveOptionalIntegrationStrategy(integration.provider) : null

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
		integrationOrId:
			| string
			| (Partial<IIntegration> & { id: string; tenantId: string; organizationId?: string | null })
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
					userId: user.id
				})
			)
		}

		integration.userId = user.id
		integration.user = user

		return user
	}
}

function pickValidatedIntegrationPatch(result: unknown): Partial<IIntegration> {
	if (!result || typeof result !== 'object' || Array.isArray(result)) {
		return {}
	}

	const patch: Partial<IIntegration> = {}

	const name = getStringProperty(result, 'name')
	if (name) {
		patch.name = name
	}

	const description = getStringProperty(result, 'description')
	if (description) {
		patch.description = description
	}

	const slug = getStringProperty(result, 'slug')
	if (slug) {
		patch.slug = slug
	}

	const provider = getStringProperty(result, 'provider')
	if (provider) {
		patch.provider = provider
	}

	const options = getObjectProperty(result, 'options')
	if (options) {
		patch.options = options
	}

	const features = getIntegrationFeatureArrayProperty(result, 'features')
	if (features) {
		patch.features = features
	}

	return patch
}

function getStringProperty(value: unknown, key: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
		return null
	}

	const candidate = Reflect.get(value, key)
	return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

function getObjectProperty(value: unknown, key: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
		return null
	}

	const candidate = Reflect.get(value, key)
	return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : null
}

function getIntegrationFeatureArrayProperty(value: unknown, key: string) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
		return null
	}

	const candidate = Reflect.get(value, key)
	const allowedValues = new Set<string>(Object.values(IntegrationFeatureEnum))
	if (!Array.isArray(candidate) || !candidate.every((item) => typeof item === 'string' && allowedValues.has(item))) {
		return null
	}

	return candidate as IntegrationFeatureEnum[]
}
