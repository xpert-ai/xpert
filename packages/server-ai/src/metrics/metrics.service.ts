import { Injectable } from '@nestjs/common'
import { applicationMetrics } from './application-metrics'

@Injectable()
export class MetricsService {
    readonly contentType = 'text/plain; version=0.0.4; charset=utf-8'

    render() {
        return applicationMetrics.render()
    }
}
