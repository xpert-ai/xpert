import { DataSourceModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { SemanticModelModule } from '../../model'
import { ProjectModule } from '../../project'
import { DataXQueryAnalysisService } from '../datax-query-analysis/datax-query-analysis.service'
import { DataXSemanticModelingMiddleware } from './datax-semantic-modeling.middleware'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'
import { DataXSemanticModelingViewProvider } from './datax-semantic-modeling-view.provider'

@Module({
	imports: [CqrsModule, SemanticModelModule, DataSourceModule, ProjectModule],
	providers: [
		DataXQueryAnalysisService,
		DataXSemanticModelingService,
		DataXSemanticModelingMiddleware,
		DataXSemanticModelingViewProvider
	],
	exports: [DataXSemanticModelingService]
})
export class DataXSemanticModelingPluginModule {}
