import { PermissionsEnum } from '@metad/contracts'
import { PERMISSIONS_METADATA } from '@metad/server-common'
import { createParamDecorator, SetMetadata } from '@nestjs/common'
import { RequestContext } from '../../core/context'

export const Permissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_METADATA, permissions)

export const UserPermissions = createParamDecorator((): PermissionsEnum[] => {
	const permissions =
		RequestContext.currentUser()?.role?.rolePermissions
			?.filter((rolePermission) => rolePermission?.enabled)
			.map((rolePermission) => rolePermission?.permission) ?? []
	return permissions.map((permission) => PermissionsEnum[permission])
})
