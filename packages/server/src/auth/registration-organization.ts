import { CurrenciesEnum, DefaultValueDateTypeEnum } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { Organization } from '../organization/organization.entity'
import { UserOrganization } from '../user-organization/user-organization.entity'

/** Called inside the tenant registration transaction; pending signup retries reuse their membership. */
export async function ensureRegistrationOrganization(
	manager: EntityManager,
	tenantId: string,
	userId: string,
	name: string
) {
	const membership = await manager.getRepository(UserOrganization).findOne({ where: { tenantId, userId } })
	if (membership) return { organizationId: membership.organizationId, created: false }
	const organizations = manager.getRepository(Organization)
	const organization = await organizations.save(
		organizations.create({
			name,
			tenantId,
			currency: CurrenciesEnum.CNY,
			defaultValueDateType: DefaultValueDateTypeEnum.TODAY,
			isDefault: false,
			isActive: true,
			show_profits: false,
			show_bonuses_paid: false,
			show_income: false,
			show_total_hours: false,
			show_projects_count: true,
			show_minimum_project_size: true,
			show_clients_count: true,
			show_clients: true,
			show_employees_count: true
		})
	)
	return { organizationId: organization.id, created: true }
}
