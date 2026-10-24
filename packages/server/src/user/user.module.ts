import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CommandHandlers } from './commands/handlers'
import { User } from './user.entity'
import { UserService } from './user.service'
import { UserController } from './user.controller'
import { TenantModule } from '../tenant/tenant.module'
import { FactoryResetModule } from './factory-reset/factory-reset.module'
import { EventHandlers } from './events/handlers'
import { EmailVerification } from './email-verification/email-verification.entity'
import { RoleModule } from '../role'
import { UserOrganizationModule } from '../user-organization/user-organization.module'
import { FeatureOrganization } from '../feature/feature-organization.entity'
import { UserDirectoryController } from './directory/user-directory.controller'
import { UserDirectoryService } from './directory/user-directory.service'
import { CurrentUserCacheService } from './current-user-cache.service'
import { CurrentUserCacheSubscriber } from './current-user-cache.subscriber'
import { CurrentUserPermissionsController } from './permissions/current-user-permissions.controller'
import { CurrentUserPermissionsService } from './permissions/current-user-permissions.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/user', module: UserModule }]),
		TypeOrmModule.forFeature([User, EmailVerification, FeatureOrganization]),
		forwardRef(() => TenantModule),
		CqrsModule,
		RoleModule,
		forwardRef(() => UserOrganizationModule),
		FactoryResetModule
	],
	controllers: [CurrentUserPermissionsController, UserDirectoryController, UserController],
	providers: [
		CurrentUserPermissionsService,
		UserDirectoryService,
		UserService,
		CurrentUserCacheService,
		CurrentUserCacheSubscriber,
		...CommandHandlers,
		...EventHandlers
	],
	exports: [TypeOrmModule, UserService, CqrsModule]
})
export class UserModule {}
