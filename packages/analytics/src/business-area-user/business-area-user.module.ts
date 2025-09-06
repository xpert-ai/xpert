import { SharedModule, TenantModule, UserModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { BusinessAreaUserController } from './business-area-user.controller'
import { BusinessAreaUser } from './business-area-user.entity'
import { BusinessAreaUserService } from './business-area-user.service'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/business-area-user', module: BusinessAreaUserModule }]),
		TypeOrmModule.forFeature([BusinessAreaUser]),
		SharedModule,
		CqrsModule,
		forwardRef(() => TenantModule),
		forwardRef(() => UserModule),
	],
	controllers: [BusinessAreaUserController],
	providers: [BusinessAreaUserService, ...CommandHandlers],
	exports: [TypeOrmModule, BusinessAreaUserService]
})
export class BusinessAreaUserModule {}
