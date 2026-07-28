import type { EventEmitter2 } from '@nestjs/event-emitter'
import type { CommandBus } from '@nestjs/cqrs'
import type { Repository } from 'typeorm'
import { BonusTypeEnum, CurrenciesEnum, DefaultValueDateTypeEnum, type IUser } from '@xpert-ai/contracts'
import { OrganizationCreateCommand } from '../organization/commands'
import type { Role } from '../core/entities/internal'
import type { UserService } from '../user/user.service'
import { Tenant } from './tenant.entity'
import { TenantService } from './tenant.service'

describe('TenantService', () => {
	function createService() {
		const tenantRepository = {}
		const userService = {
			update: jest.fn()
		}
		const roleRepository = {
			findOneBy: jest.fn().mockResolvedValue({
				id: 'super-admin-role-1'
			})
		}
		const commandBus = {
			execute: jest.fn()
		}
		const eventEmitter = {
			emit: jest.fn()
		}
		const service = new TenantService(
			tenantRepository as Repository<Tenant>,
			userService as unknown as UserService,
			roleRepository as unknown as Repository<Role>,
			commandBus as unknown as CommandBus,
			eventEmitter as unknown as EventEmitter2
		)
		const tenant = {
			id: 'tenant-1',
			name: 'Default Tenant'
		} as Tenant
		jest.spyOn(service, 'create').mockResolvedValue(tenant)

		return {
			commandBus,
			service,
			tenant
		}
	}

	it('passes the first super admin only when creating the onboarding default organization', async () => {
		const { commandBus, service, tenant } = createService()
		const organization = {
			id: 'org-1',
			tenantId: tenant.id,
			name: 'Default Organization'
		}
		commandBus.execute.mockImplementation(async (command) => {
			if (command instanceof OrganizationCreateCommand) {
				return organization
			}
			return undefined
		})

		await service.onboardTenant(
			{
				name: tenant.name,
				defaultOrganization: {
					name: organization.name,
					isDefault: true,
					profile_link: '',
					imageUrl: '',
					currency: CurrenciesEnum.USD,
					client_focus: '',
					defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
					bonusType: BonusTypeEnum.PROFIT_BASED_BONUS,
					tenant
				}
			},
			{
				id: 'super-admin-1'
			} as IUser,
			{ skipSubdomainPreparation: true }
		)

		const organizationCommand = commandBus.execute.mock.calls
			.map(([command]) => command)
			.find((command) => command instanceof OrganizationCreateCommand)
		expect(organizationCommand).toEqual(
			expect.objectContaining({
				onboardingSuperAdminUserId: 'super-admin-1'
			})
		)
	})

	it('does not create an organization membership when onboarding has no default organization', async () => {
		const { commandBus, service, tenant } = createService()

		await service.onboardTenant(
			{
				name: tenant.name
			},
			{
				id: 'super-admin-1'
			} as IUser,
			{ skipSubdomainPreparation: true }
		)

		expect(commandBus.execute.mock.calls.some(([command]) => command instanceof OrganizationCreateCommand)).toBe(
			false
		)
	})
})
