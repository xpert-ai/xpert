import { UserOrganizationCreateHandler } from './user-organization.create.handler'
import { UserOrganizationDeleteHandler } from './user-organization.delete.handler'
import { ResolveUserOrganizationAccessHandler } from './resolve-user-organization-access.handler'

export const CommandHandlers = [
	UserOrganizationDeleteHandler,
	UserOrganizationCreateHandler,
	ResolveUserOrganizationAccessHandler
]
