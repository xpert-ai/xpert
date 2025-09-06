import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { RolePermissionModule } from '../role-permission/role-permission.module'
import { RoleModule } from '../role/role.module'
import { UserModule } from '../user/user.module'
import { FeatureModule } from './../feature/feature.module'
import { CommandHandlers } from './commands/handlers'
import { EventHandlers } from './events/handlers'
import { TenantController } from './tenant.controller'
import { Tenant } from './tenant.entity'
import { TenantService } from './tenant.service'
import { QueryHandlers } from './queries/handlers'

@Module({
  imports: [
    RouterModule.register([{ path: '/tenant', module: TenantModule }]),
    TypeOrmModule.forFeature([Tenant]),
	  forwardRef(() => FeatureModule),
    forwardRef(() => UserModule),
    RoleModule,
    RolePermissionModule,
    CqrsModule
  ],
  controllers: [TenantController],
  providers: [TenantService, ...CommandHandlers, ...QueryHandlers, ...EventHandlers],
  exports: [TenantService, RolePermissionModule]
})
export class TenantModule {}
