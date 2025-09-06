import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { UserOrganizationService } from './user-organization.services';
import { UserOrganizationController } from './user-organization.controller';
import { UserOrganization } from './user-organization.entity';
import { CommandHandlers } from './commands/handlers';
import { SharedModule } from '../shared';
import { TenantModule } from '../tenant/tenant.module';
import { OrganizationModule } from './../organization/organization.module';
import { UserModule } from './../user/user.module';
import { RoleModule } from './../role/role.module';

@Module({
	imports: [
		RouterModule.register([
			{ path: '/user-organization', module: UserOrganizationModule }
		]),
		TypeOrmModule.forFeature([ UserOrganization ]),
		SharedModule,
		CqrsModule,
		forwardRef(() => TenantModule),
		// TenantModule,
		forwardRef(() => OrganizationModule),
		forwardRef(() => UserModule),
		forwardRef(() => RoleModule),
	],
	controllers: [UserOrganizationController],
	providers: [
		UserOrganizationService,
		...CommandHandlers
	],
	exports: [
		UserOrganizationService
	]
})
export class UserOrganizationModule {}
