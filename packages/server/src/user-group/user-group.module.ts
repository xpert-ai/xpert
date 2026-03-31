import { Module, forwardRef } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule } from '../user'
import { UserOrganizationModule } from '../user-organization/user-organization.module'
import { UserGroupController } from './user-group.controller'
import { UserGroup } from './user-group.entity'
import { UserGroupService } from './user-group.service'
import { Organization, User, UserOrganization } from '../core/entities/internal'

@Module({
	imports: [
		RouterModule.register([{ path: '/user-groups', module: UserGroupModule }]),
		TypeOrmModule.forFeature([UserGroup, UserOrganization, User, Organization]),
		forwardRef(() => UserModule),
		forwardRef(() => UserOrganizationModule)
	],
	controllers: [UserGroupController],
	providers: [UserGroupService],
	exports: [TypeOrmModule, UserGroupService]
})
export class UserGroupModule {}
