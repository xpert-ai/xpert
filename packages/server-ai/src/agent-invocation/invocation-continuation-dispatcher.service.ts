// A parent continuation may run for hours; it must not hold up dependency observation.
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { LessThanOrEqual } from 'typeorm'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { AgentInvocationMonitorService } from './invocation-monitor.service'

@Injectable()
export class InvocationContinuationDispatcher implements OnModuleDestroy {
    private readonly logger = new Logger(InvocationContinuationDispatcher.name)
    private readonly active = new Set<string>()
    private scanning = false
    private stopping = false
    constructor(
        private readonly waits: AgentInvocationWaitStore,
        private readonly monitor: AgentInvocationMonitorService
    ) {}
    onModuleDestroy() {
        this.stopping = true
    }

    @Interval(1000)
    async dispatch() {
        if (this.scanning || this.stopping || this.active.size >= 4) return
        this.scanning = true
        try {
            const rows = await this.waits.records.find({
                where: { state: 'ready', nextCheckAt: LessThanOrEqual(new Date()) },
                order: { nextCheckAt: 'ASC' },
                take: 10
            })
            for (const row of rows) {
                if (this.active.size >= 4 || this.stopping) break
                if (this.active.has(row.id)) continue
                this.active.add(row.id)
                void this.monitor
                    .deliver(row)
                    .catch(() => this.logger.warn('Task continuation delivery failed'))
                    .finally(() => this.active.delete(row.id))
            }
        } finally {
            this.scanning = false
        }
    }
}
