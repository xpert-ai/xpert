// Application secrets stay in Integration. Public connector choices contain only
// identity; retry keys are unique per binding and never update an existing app.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { PermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import type {
	ConnectorAppCredentialsConfig,
	ConnectorIntegrationOption,
	ConnectorIntegrationSelection
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { Integration } from '../integration.entity'
import { CheckRolePermissionCommand } from '../../role-permission/commands/check-role-permission.command'

type Scope = { tenantId: string; organizationId: string | null }
type Descriptor = NonNullable<ConnectorAppCredentialsConfig['integration']>

@Injectable()
export class ConnectorAppIntegrationService {
	constructor(
		@InjectRepository(Integration)
		private readonly repository: Pick<Repository<Integration>, 'find' | 'findOne' | 'createQueryBuilder'>,
		@Inject(CommandBus) private readonly commands: Pick<CommandBus, 'execute'>
	) {}

	async list(scope: Scope, descriptor: Descriptor): Promise<ConnectorIntegrationOption[]> {
		this.assertTenant(scope)
		const integrations = await this.repository.find({
			where: this.where(scope, descriptor.provider),
			order: { createdAt: 'ASC' }
		})
		return integrations.filter((item) => this.configured(item.options, descriptor)).map(publicOption)
	}

	async select(scope: Scope, descriptor: Descriptor, id: string): Promise<ConnectorIntegrationOption> {
		this.assertTenant(scope)
		const integration = await this.repository.findOne({
			where: this.where(scope, descriptor.provider).map((where) => ({ ...where, id }))
		})
		if (!integration || !this.configured(integration.options, descriptor)) throw unavailable()
		return publicOption(integration)
	}

	async create(
		scope: Scope,
		descriptor: Descriptor,
		bindingId: string,
		input: Extract<ConnectorIntegrationSelection, { type: 'new' }>
	): Promise<ConnectorIntegrationOption> {
		this.assertTenant(scope)
		const roleId = RequestContext.currentRoleId()
		if (
			!roleId ||
			!(await this.commands.execute(
				new CheckRolePermissionCommand(scope.tenantId, roleId, [PermissionsEnum.INTEGRATION_EDIT], true)
			))
		) {
			throw new ForbiddenException(t('server-ai:Error.ConnectorIntegrationCreateForbidden'))
		}
		const fields = new Set(descriptor.fields.map((field) => field.name))
		if (Object.keys(input.values).some((name) => !fields.has(name)) || !this.configured(input.values, descriptor))
			throw unavailable()
		const slug = `connector-${bindingId}-${input.requestId}`
		const where = {
			tenantId: scope.tenantId,
			organizationId: scope.organizationId ?? IsNull(),
			slug,
			provider: descriptor.provider
		}
		const previous = await this.repository.findOne({ where })
		if (previous) return this.createdOption(previous, input)
		const application = Object.assign(new Integration(), {
			...scope,
			slug,
			provider: descriptor.provider,
			name: input.name,
			options: input.values,
			createdById: RequestContext.currentUserId(),
			updatedById: RequestContext.currentUserId()
		})
		await this.repository.createQueryBuilder().insert().into(Integration).values(application).orIgnore().execute()
		// The unique slug also deduplicates concurrent retries on different API replicas.
		const created = await this.repository.findOne({ where })
		if (!created) throw unavailable()
		return this.createdOption(created, input)
	}

	private createdOption(integration: Integration, input: Extract<ConnectorIntegrationSelection, { type: 'new' }>) {
		const options: unknown = integration.options
		if (
			integration.name !== input.name ||
			!options ||
			typeof options !== 'object' ||
			Array.isArray(options) ||
			Object.keys(options).length !== Object.keys(input.values).length ||
			Object.entries(input.values).some(([field, value]) => Reflect.get(options, field) !== value)
		) {
			throw new BadRequestException(t('server-ai:Error.ConnectorIntegrationInvalid'))
		}
		return publicOption(integration)
	}

	private assertTenant(scope: Scope) {
		if (!scope.tenantId || scope.tenantId !== RequestContext.currentTenantId()) throw new ForbiddenException()
	}

	private where(scope: Scope, provider: string) {
		const tenant = { tenantId: scope.tenantId, organizationId: IsNull(), provider }
		return scope.organizationId ? [tenant, { ...tenant, organizationId: scope.organizationId }] : [tenant]
	}

	private configured(options: unknown, descriptor: Descriptor) {
		return (
			!!options &&
			typeof options === 'object' &&
			!Array.isArray(options) &&
			descriptor.fields.every((field) => {
				const value: unknown = Reflect.get(options, field.name)
				return !field.required || (typeof value === 'string' && !!value.trim())
			})
		)
	}
}

function publicOption(integration: Integration): ConnectorIntegrationOption {
	return { id: integration.id, name: integration.name, organizationId: integration.organizationId ?? null }
}
function unavailable() {
	return new BadRequestException(t('server-ai:Error.ConnectorIntegrationUnavailable'))
}
