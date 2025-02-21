import { TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { QueryHandlers } from './queries/handlers'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		TenantModule,
		CqrsModule,
	],
	controllers: [],
	providers: [...QueryHandlers, ...CommandHandlers],
	exports: []
})
export class RagWebModule {}
