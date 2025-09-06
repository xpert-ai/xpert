import { SharedModule, TenantModule } from '@metad/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RouterModule } from '@nestjs/core'
import { CaslModule } from '../core/index'
import { StoryTemplateController } from './story-template.controller'
import { StoryTemplate } from './story-template.entity'
import { StoryTemplateService } from './story-template.service'

@Module({
	imports: [
		RouterModule.register([{ path: '/story-template', module: StoryTemplateModule }]),
		TypeOrmModule.forFeature([StoryTemplate]),
		TenantModule,
		SharedModule,
		CqrsModule,
		CaslModule
	],
	controllers: [StoryTemplateController],
	providers: [StoryTemplateService],
	exports: [StoryTemplateService]
})
export class StoryTemplateModule {}
