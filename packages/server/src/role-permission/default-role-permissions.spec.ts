import { PermissionsEnum, RolesEnum } from '@xpert-ai/contracts'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'

const permissionsFor = (role: RolesEnum) =>
	DEFAULT_ROLE_PERMISSIONS.find((item) => item.role === role)?.defaultEnabledPermissions ?? []

describe('default role permissions', () => {
	it('grants TRIAL only the selected platform permissions by default', () => {
		expect([...permissionsFor(RolesEnum.TRIAL)].sort()).toEqual(
			[
				PermissionsEnum.DATA_SOURCE_EDIT,
				PermissionsEnum.DATA_SOURCE_VIEW,
				PermissionsEnum.PROFILE_EDIT,
				PermissionsEnum.ORG_INVITE_EDIT,
				PermissionsEnum.INTEGRATION_EDIT,
				PermissionsEnum.CHANGE_SELECTED_ORGANIZATION,
				PermissionsEnum.INTEGRATION_VIEW
			].sort()
		)
	})
})
