import { AIPermissionsEnum, IRole, IRolePermission, RolesEnum } from '@xpert-ai/contracts'
import { missingApplicationPermissions } from './application-permission-upgrade'
import { setDefaultRolePermissions } from './default-role-permissions'

const role: IRole = { id: 'role', tenantId: 'tenant', name: 'custom-builder' }
const grant = (permission: string, enabled = true): IRolePermission => ({
	tenantId: 'tenant',
	roleId: 'role',
	role,
	permission,
	enabled
})
describe('application permission upgrade', () => {
	it('preserves editing compatibility for custom roles without introducing installation authority', () => {
		expect(missingApplicationPermissions([role], [grant(AIPermissionsEnum.XPERT_EDIT)])).toEqual([
			{ roleId: 'role', tenantId: 'tenant', permission: AIPermissionsEnum.XPERT_VIEW, enabled: true }
		])
	})
	it('never enables an existing disabled grant and is idempotent', () => {
		expect(
			missingApplicationPermissions(
				[role],
				[grant(AIPermissionsEnum.XPERT_EDIT), grant(AIPermissionsEnum.XPERT_VIEW, false)]
			)
		).toEqual([])
		expect(
			missingApplicationPermissions(
				[role],
				[grant(AIPermissionsEnum.XPERT_EDIT), grant(AIPermissionsEnum.XPERT_VIEW)]
			)
		).toEqual([])
	})
	it('does not restore authoring through new defaults after an explicit revocation', () => {
		setDefaultRolePermissions(RolesEnum.AI_BUILDER, [
			AIPermissionsEnum.XPERT_VIEW,
			AIPermissionsEnum.APPLICATION_INSTALL
		])
		expect(
			missingApplicationPermissions(
				[{ ...role, name: RolesEnum.AI_BUILDER }],
				[grant(AIPermissionsEnum.XPERT_EDIT, false)]
			)
		).toEqual([])
	})
	it('does not use another tenant or role grants', () => {
		expect(
			missingApplicationPermissions([role], [{ ...grant(AIPermissionsEnum.XPERT_EDIT), tenantId: 'other' }])
		).toEqual([])
		expect(
			missingApplicationPermissions([role], [{ ...grant(AIPermissionsEnum.XPERT_EDIT), roleId: 'other' }])
		).toEqual([])
	})
})
