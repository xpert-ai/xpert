import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource, LessThanOrEqual } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { isAgentInvocationTerminal } from '@xpert-ai/plugin-sdk'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { AgentInvocationFactoryService } from '../../agent-invocation/invocation-factory.service'
import { RuntimeMessageAccessService } from './runtime-message-access.service'
import { ProjectRuntimeObservationCommand } from './runtime-message.commands'

/** Observe durable handles independently of the parent turn. Missing receipts are never launch instructions. */
@Injectable()
export class RuntimeObservationMonitorService {
    private scanning = false
    private readonly logger = new Logger(RuntimeObservationMonitorService.name)
    constructor(
        private readonly dataSource: DataSource,
        private readonly access: RuntimeMessageAccessService,
        private readonly factory: AgentInvocationFactoryService,
        private readonly commands: CommandBus
    ) {}

    @Interval(5000)
    async reconcile() {
        if (this.scanning) return
        this.scanning = true
        try {
            const rows = await this.dataSource
                .getRepository(AgentInvocationEntity)
                .createQueryBuilder('invocation')
                .where({ nextObservationAt: LessThanOrEqual(new Date()) })
                .andWhere("invocation.invocation->'request'->'dispatch' IS NOT NULL")
                .orderBy('invocation.nextObservationAt', 'ASC')
                .take(20)
                .getMany()
            await Promise.allSettled(rows.map((row) => this.observe(row)))
        } catch {
            this.logger.warn('Runtime observation scan deferred')
        } finally {
            this.scanning = false
        }
    }

    async observe(row: AgentInvocationEntity) {
        const repo = this.dataSource.getRepository(AgentInvocationEntity)
        const token = randomUUID()
        const claim = await repo
            .createQueryBuilder()
            .update()
            .set({ observationLeaseToken: token, observationLeaseUntil: new Date(Date.now() + 60_000) })
            .where({ id: row.id })
            .andWhere('("observationLeaseUntil" IS NULL OR "observationLeaseUntil" < now())')
            .execute()
        if (!claim.affected) return
        const owned = { id: row.id, observationLeaseToken: token }
        try {
            await this.access.withActor(row.invocation.scope, async () => {
                const invocation = await this.factory.createCapturedApi(row.invocation.scope).inspect(row.id)
                if (invocation.request.dispatch?.projectTask)
                    await this.commands.execute(new ProjectRuntimeObservationCommand(invocation.id))
                await repo.update(
                    { ...owned, revision: invocation.revision },
                    {
                        nextObservationAt: isAgentInvocationTerminal(invocation.status)
                            ? null
                            : new Date(Date.now() + (invocation.status === 'unknown' ? 60_000 : 5000)),
                        observationError: null
                    }
                )
            })
        } catch {
            await repo.update(owned, {
                nextObservationAt: new Date(Date.now() + 60_000),
                observationError: 'observation_unavailable'
            })
        } finally {
            await repo.update(owned, { observationLeaseToken: null, observationLeaseUntil: null })
        }
    }
}
