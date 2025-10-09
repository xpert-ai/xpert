import { SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { BusinessAreaModule } from '../business-area'
import { QueryHandlers } from './queries/handlers'
import { StoryPointController } from './story-point.controller'
import { StoryPoint } from './story-point.entity'
import { StoryPointService } from './story-point.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/story-point', module: StoryPointModule }]),
		TypeOrmModule.forFeature([StoryPoint]),
		TenantModule,
		SharedModule,
		CqrsModule,
		BusinessAreaModule
	],
	controllers: [StoryPointController],
	providers: [StoryPointService, ...QueryHandlers],
	exports: [TypeOrmModule, StoryPointService]
})
export class StoryPointModule {}
