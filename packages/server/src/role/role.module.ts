import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { UserModule } from '../user/user.module'
import { TenantModule } from './../tenant/tenant.module'
import { CommandHandlers } from './commands/handlers'
import { RoleController } from './role.controller'
import { Role } from './role.entity'
import { RoleService } from './role.service'
import { Invite, User } from '../core/entities/internal'

@Module({
	imports: [
		RouterModule.register([{ path: '/roles', module: RoleModule }]),
		TypeOrmModule.forFeature([Role, User, Invite]),
		forwardRef(() => TenantModule),
		forwardRef(() => UserModule),
		CqrsModule,
	],
	controllers: [RoleController],
	providers: [RoleService, ...CommandHandlers],
	exports: [TypeOrmModule, RoleService],
})
export class RoleModule {}
