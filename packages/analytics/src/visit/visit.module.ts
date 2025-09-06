import { SharedModule, TenantModule } from '@metad/server-core'
import { forwardRef, Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { IndicatorModule } from '../indicator/index'
import { SemanticModelModule } from '../model/index'
import { StoryModule } from '../story/story.module'
import { CommandHandlers } from './commands/handlers'
import { VisitController } from './visit.controller'
import { Visit } from './visit.entity'
import { VisitService } from './visit.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/visits', module: VisitModule }]),
		TypeOrmModule.forFeature([Visit]),
		forwardRef(() => TenantModule),
		SharedModule,
		CqrsModule,
		StoryModule,
		SemanticModelModule,
		IndicatorModule,
	],
	providers: [ VisitService, ...CommandHandlers ],
	controllers: [ VisitController ]
})
export class VisitModule {}
