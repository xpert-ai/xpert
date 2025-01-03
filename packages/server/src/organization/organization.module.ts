import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouterModule } from 'nest-router';
import { UserOrganizationModule } from './../user-organization/user-organization.module';
import { TenantModule } from '../tenant/tenant.module';
import { RoleModule } from './../role/role.module';
import { CommandHandlers } from './commands/handlers';
import { OrganizationController } from './organization.controller';
import { Organization } from './organization.entity';
import { OrganizationService } from './organization.service';
import { RolePermissionModule } from '../role-permission';
import { UserModule } from '../user';

@Module({
	imports: [
		RouterModule.forRoutes([
			{ path: '/organization', module: OrganizationModule }
		]),
		TypeOrmModule.forFeature([ Organization ]),
		forwardRef(() => TenantModule),
		forwardRef(() => UserOrganizationModule),
		forwardRef(() => RolePermissionModule),
		forwardRef(() => RoleModule),
		forwardRef(() => UserModule),
		CqrsModule,
	],
	controllers: [OrganizationController],
	providers: [
		OrganizationService,
		...CommandHandlers
	],
	exports: [
		TypeOrmModule,
		OrganizationService
	]
})
export class OrganizationModule {}
