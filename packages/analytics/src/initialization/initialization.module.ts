import { OrganizationModule, UserModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSourceTypeModule } from '../data-source-type/data-source-type.module'
import { SemanticModelModule } from '../model/model.module'
import {
	BusinessArea,
	BusinessAreaUser,
	DataSource,
	Indicator,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget
} from '../core/entities/internal'
import { ANALYTICS_BOOTSTRAP_QUEUE } from './constants'
import { AnalyticsBootstrapProcessor } from './bootstrap.processor'
import { AnalyticsBootstrapService } from './bootstrap.service'

@Module({
	imports: [
		BullModule.registerQueue({
			name: ANALYTICS_BOOTSTRAP_QUEUE
		}),
		TypeOrmModule.forFeature([
			DataSource,
			SemanticModel,
			Story,
			StoryPoint,
			StoryWidget,
			BusinessArea,
			BusinessAreaUser,
			Indicator
		]),
		OrganizationModule,
		UserModule,
		UserOrganizationModule,
		DataSourceTypeModule,
		SemanticModelModule
	],
	providers: [AnalyticsBootstrapProcessor, AnalyticsBootstrapService]
})
export class InitializationModule {}
