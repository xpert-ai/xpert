import { XpertToolsetModule } from '@metad/server-ai'
import { SharedModule, TenantModule, UserModule } from '@metad/server-core'
import { Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { DataSourceAuthentication } from './authentication/authentication.entity'
import { CommandHandlers } from './commands/handlers'
import { DataSourceController } from './data-source.controller'
import { DataSource } from './data-source.entity'
import { DataSourceService } from './data-source.service'
import { EventHandlers } from './events/handlers'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/data-source', module: DataSourceModule }]),
		TypeOrmModule.forFeature([DataSource, DataSourceAuthentication]),
		forwardRef(() => TenantModule),
		forwardRef(() => UserModule),
		SharedModule,
		CqrsModule,
		XpertToolsetModule
	],
	providers: [DataSourceService, ...EventHandlers, ...CommandHandlers, ...QueryHandlers],
	controllers: [DataSourceController],
	exports: [TypeOrmModule, DataSourceService]
})
export class DataSourceModule {}
