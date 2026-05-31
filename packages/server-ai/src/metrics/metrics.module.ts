import { Module } from '@nestjs/common'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'

@Module({
    controllers: [MetricsController],
    providers: [MetricsService],
    exports: [MetricsService]
})
export class MetricsModule {}
