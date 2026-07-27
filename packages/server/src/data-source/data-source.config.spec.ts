import { FeatureEnum, PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { DEFAULT_FEATURES } from '../feature/default-features'
import { DEFAULT_ROLE_PERMISSIONS } from '../role-permission/default-role-permissions'

const rolesWithDataSourcePermissions = [
	RolesEnum.SUPER_ADMIN,
	RolesEnum.ADMIN,
	RolesEnum.TRIAL,
	RolesEnum.ANALYTICS_BUILDER
]

const rolesWithoutDataSourcePermissions = [RolesEnum.AI_BUILDER, RolesEnum.VIEWER]

describe('server-owned data source configuration', () => {
	it('registers the data source feature in server defaults', () => {
		expect(DEFAULT_FEATURES).toContainEqual(
			expect.objectContaining({
				code: FeatureEnum.FEATURE_DATA_SOURCE,
				link: 'settings/data-sources',
				isEnabled: true
			})
		)
	})

	it.each(rolesWithDataSourcePermissions)('grants data source permissions to %s', (role) => {
		const permissions = DEFAULT_ROLE_PERMISSIONS.find((item) => item.role === role)?.defaultEnabledPermissions

		expect(permissions).toEqual(
			expect.arrayContaining([PermissionsEnum.DATA_SOURCE_VIEW, PermissionsEnum.DATA_SOURCE_EDIT])
		)
	})

	it.each(rolesWithoutDataSourcePermissions)('does not grant data source permissions to %s', (role) => {
		const permissions = DEFAULT_ROLE_PERMISSIONS.find((item) => item.role === role)?.defaultEnabledPermissions

		expect(permissions).not.toEqual(
			expect.arrayContaining([PermissionsEnum.DATA_SOURCE_VIEW, PermissionsEnum.DATA_SOURCE_EDIT])
		)
	})
})
