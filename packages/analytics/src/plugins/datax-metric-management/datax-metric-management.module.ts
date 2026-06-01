import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { IndicatorModule } from '../../indicator'
import { ProjectModule } from '../../project'
import { DataXMetricManagementMiddleware } from './datax-metric-management.middleware'
import { DataXMetricManagementViewProvider } from './datax-metric-management-view.provider'

@Module({
	imports: [CqrsModule, ProjectModule, IndicatorModule],
	providers: [DataXMetricManagementMiddleware, DataXMetricManagementViewProvider]
})
export class DataXMetricManagementPluginModule {}
