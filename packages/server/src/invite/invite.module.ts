import { forwardRef, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouterModule } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { EmailModule } from '../email/email.module';
import { EmailService } from '../email/email.service';
import { SharedModule } from '../shared';
import { CommandHandlers } from './commands/handlers';
import { TenantModule } from '../tenant/tenant.module';
import { RoleModule } from './../role/role.module';
import { UserModule } from './../user/user.module';
import { OrganizationContactModule } from './../organization-contact/organization-contact.module';
import { OrganizationModule } from './../organization/organization.module';
import { UserOrganizationModule } from './../user-organization/user-organization.module';
import { InviteController } from './invite.controller';
import { Invite } from './invite.entity';
import { InviteService } from './invite.service';
import { RolePermissionModule } from '../role-permission';

@Module({
	imports: [
		RouterModule.register([
			{ path: '/invite', module: InviteModule }
		]),
		TypeOrmModule.forFeature([ Invite ]),
		forwardRef(() => RolePermissionModule),
		forwardRef(() => UserModule),
		SharedModule,
		CqrsModule,
		EmailModule,
		TenantModule,
		RoleModule,
		OrganizationModule,
		OrganizationContactModule,
		UserOrganizationModule
	],
	controllers: [InviteController],
	providers: [
		InviteService,
		...CommandHandlers,
		AuthService,
		EmailService,
	],
	exports: [
		TypeOrmModule,
		InviteService
	]
})
export class InviteModule {}
