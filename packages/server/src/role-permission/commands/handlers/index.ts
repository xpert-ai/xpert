import { CheckRolePermissionHandler } from './check-role-permission.handler';
import { TenantRolePermissionBulkCreateHandler } from './tenant-role-bulk-create.handler';

export const CommandHandlers = [TenantRolePermissionBulkCreateHandler, CheckRolePermissionHandler];
