import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SecretTokenModule, SharedModule, TenantModule } from '@metad/server-core'
import { RouterModule } from '@nestjs/core'
import { CaslModule } from '../core/index'
import { StoryPointModule } from '../story-point/story-point.module'
import { StoryWidgetModule } from '../story-widget/story-widget.module'
import { CommandHandlers } from './commands/handlers'
import { StoryController } from './story.controller'
import { Story } from './story.entity'
import { StoryService } from './story.service'
import { BusinessAreaUserModule } from '../business-area-user/index'
import { QueryHandlers } from './queries/handlers'

@Module({
	imports: [
		RouterModule.register([{ path: '/stories', module: StoryModule }]),
		TypeOrmModule.forFeature([Story]),
		TenantModule,
		SharedModule,
		CqrsModule,
		CaslModule,
		BusinessAreaUserModule,
		StoryPointModule,
		StoryWidgetModule,
		SecretTokenModule
	],
	controllers: [StoryController],
	providers: [StoryService, ...CommandHandlers, ...QueryHandlers],
	exports: [TypeOrmModule, StoryService],
})
export class StoryModule {}
