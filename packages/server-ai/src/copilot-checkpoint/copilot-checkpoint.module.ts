import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { DatabaseModule } from '@metad/server-core'
import { TenantModule } from '@metad/server-core'
import { CopilotCheckpointSaver } from './checkpoint-saver'
import { CopilotCheckpointController } from './copilot-checkpoint.controller'
import { CopilotCheckpoint } from './copilot-checkpoint.entity'
import { CopilotCheckpointService } from './copilot-checkpoint.service'
import { CopilotCheckpointWrites } from './writes/writes.entity'
import { CopilotCheckpointWritesService } from './writes/writes.service'
import { QueryHandlers } from './queries/handlers'
import { CommandHandlers } from './commands/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/copilot-checkpoint', module: CopilotCheckpointModule }]),
		TypeOrmModule.forFeature([CopilotCheckpoint, CopilotCheckpointWrites]),
		TenantModule,
		CqrsModule,
		DatabaseModule
	],
	controllers: [CopilotCheckpointController],
	providers: [CopilotCheckpointService, CopilotCheckpointSaver, CopilotCheckpointWritesService, ...QueryHandlers, ...CommandHandlers],
	exports: [CopilotCheckpointService, CopilotCheckpointSaver]
})
export class CopilotCheckpointModule {}
