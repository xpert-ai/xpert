import { Module } from '@nestjs/common'
import { SemanticModelModule } from '../../model'
import { DataXQueryAnalysisMiddleware } from './datax-query-analysis.middleware'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'
import { DataXQueryAnalysisViewProvider } from './datax-query-analysis-view.provider'

@Module({
	imports: [SemanticModelModule],
	providers: [DataXQueryAnalysisService, DataXQueryAnalysisMiddleware, DataXQueryAnalysisViewProvider],
	exports: [DataXQueryAnalysisService]
})
export class DataXQueryAnalysisPluginModule {}
