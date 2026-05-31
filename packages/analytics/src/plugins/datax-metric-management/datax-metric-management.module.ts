import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { IndicatorModule } from '../../indicator'
import { ProjectModule } from '../../project'
import { DataXMetricManagementStrategy } from './datax-metric-management.strategy'
import { DataXMetricManagementViewProvider } from './datax-metric-management-view.provider'

@Module({
	imports: [CqrsModule, ProjectModule, IndicatorModule],
	providers: [DataXMetricManagementStrategy, DataXMetricManagementViewProvider]
})
export class DataXMetricManagementPluginModule {}
