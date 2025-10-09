import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { RolePermissionController } from './role-permission.controller';
import { RolePermission } from './role-permission.entity';
import { RolePermissionService } from './role-permission.service';
import { UserModule } from '../user/user.module';
import { TenantModule } from '../tenant/tenant.module';
import { CommandHandlers } from './commands/handlers';
import { RoleModule } from '../role/role.module';

@Module({
	imports: [
		RouterModule.register([
			{ path: 'role-permissions', module: RolePermissionModule }
		]),
		TypeOrmModule.forFeature([ RolePermission ]),
		forwardRef(() => TenantModule),
		forwardRef(() => UserModule),
		forwardRef(() => RoleModule),
		CqrsModule
	],
	controllers: [RolePermissionController],
	providers: [RolePermissionService, ...CommandHandlers],
	exports: [RolePermissionService]
})
export class RolePermissionModule {}
