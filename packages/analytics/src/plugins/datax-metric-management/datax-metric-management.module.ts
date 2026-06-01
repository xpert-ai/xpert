import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { IndicatorModule } from '../../indicator'
import { ProjectModule } from '../../project'
import { DataXMetricManagementService } from './datax-metric-management.service'
import { DataXMetricManagementMiddleware } from './datax-metric-management.middleware'
import { DataXMetricManagementViewProvider } from './datax-metric-management-view.provider'

@Module({
	imports: [CqrsModule, ProjectModule, IndicatorModule],
	providers: [DataXMetricManagementService, DataXMetricManagementMiddleware, DataXMetricManagementViewProvider],
	exports: [DataXMetricManagementService]
})
export class DataXMetricManagementPluginModule {}
