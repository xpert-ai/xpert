import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { RouterModule } from '@nestjs/core';
import { OrganizationContact } from './organization-contact.entity';
import { OrganizationContactController } from './organization-contact.controller';
import { OrganizationContactService } from './organization-contact.service';
import { CommandHandlers } from './commands/handlers';
import { EmailModule } from '../email';
import { TenantModule } from '../tenant/tenant.module';
import { OrganizationModule } from './../organization/organization.module';
import { UserModule } from './../user/user.module';

@Module({
	imports: [
		RouterModule.register([
			{ path: '/organization-contact', module: OrganizationContactModule }
		]),
		TypeOrmModule.forFeature([ OrganizationContact ]),
		CqrsModule,
		TenantModule,
		OrganizationModule,
		UserModule,
		EmailModule
	],
	controllers: [OrganizationContactController],
	providers: [
		OrganizationContactService,
		...CommandHandlers
	],
	exports: [
		TypeOrmModule,
		OrganizationContactService
	]
})
export class OrganizationContactModule {}
