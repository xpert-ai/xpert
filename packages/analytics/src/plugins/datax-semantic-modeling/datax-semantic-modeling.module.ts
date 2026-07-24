import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DataSourceModule } from '../../data-source'
import { SemanticModelModule } from '../../model'
import { DataXQueryAnalysisService } from '../datax-query-analysis/datax-query-analysis.service'
import { DataXSemanticModelingMiddleware } from './datax-semantic-modeling.middleware'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'
import { DataXSemanticModelingViewProvider } from './datax-semantic-modeling-view.provider'

@Module({
	imports: [CqrsModule, SemanticModelModule, DataSourceModule],
	providers: [
		DataXQueryAnalysisService,
		DataXSemanticModelingService,
		DataXSemanticModelingMiddleware,
		DataXSemanticModelingViewProvider
	],
	exports: [DataXSemanticModelingService]
})
export class DataXSemanticModelingPluginModule {}
