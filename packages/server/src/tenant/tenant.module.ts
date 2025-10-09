import { forwardRef, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RolePermissionModule } from '../role-permission/role-permission.module'
import { RoleModule } from '../role/role.module'
import { UserModule } from '../user/user.module'
import { CommandHandlers } from './commands/handlers'
import { EventHandlers } from './events/handlers'
import { QueryHandlers } from './queries/handlers'
import { TenantController } from './tenant.controller'
import { Tenant } from './tenant.entity'
import { TenantService } from './tenant.service'
import { FeatureModule } from '../feature/feature.module'

@Module({
	imports: [
		RouterModule.register([{ path: '/tenant', module: TenantModule }]),
		TypeOrmModule.forFeature([Tenant]),
		CqrsModule,
		forwardRef(() => UserModule),
		forwardRef(() => RoleModule),
		forwardRef(() => RolePermissionModule),
		forwardRef(() => FeatureModule),
	],
	controllers: [TenantController],
	providers: [TenantService, ...CommandHandlers, ...QueryHandlers, ...EventHandlers],
	exports: [TenantService]
})
export class TenantModule {}
