import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { UserOrganizationService } from './user-organization.services'
import { UserOrganizationController } from './user-organization.controller'
import { UserOrganization } from './user-organization.entity'
import { CommandHandlers } from './commands/handlers'
import { TenantModule } from '../tenant/tenant.module'
import { OrganizationModule } from './../organization/organization.module'
import { UserModule } from './../user/user.module'
import { RoleModule } from './../role/role.module'
import { Organization } from '../organization/organization.entity'
import { User } from '../user/user.entity'

@Module({
	imports: [
		RouterModule.register([{ path: '/user-organization', module: UserOrganizationModule }]),
		TypeOrmModule.forFeature([UserOrganization, User, Organization]),
		CqrsModule,
		forwardRef(() => TenantModule),
		forwardRef(() => OrganizationModule),
		forwardRef(() => UserModule),
		forwardRef(() => RoleModule)
	],
	controllers: [UserOrganizationController],
	providers: [UserOrganizationService, ...CommandHandlers],
	exports: [TypeOrmModule, UserOrganizationService]
})
export class UserOrganizationModule {}
