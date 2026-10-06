import { EventBus } from '@nestjs/cqrs'
import { TaskObservationCommittedEvent } from '../runtime-task/task-observation.event'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { AgentInvocationScope } from '@xpert-ai/plugin-sdk'
import { EntityManager, Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import { AgentInvocationStore, StoredAgentInvocation } from './invocation-store'
import { AgentInvocationEntity, AgentInvocationEventEntity } from './invocation.entity'
import { appendRuntimeDelivery } from '../handoff/runtime-messaging/runtime-message-outbox'

@Injectable()
export class TypeOrmAgentInvocationStore extends AgentInvocationStore {
    private readonly logger = new Logger(TypeOrmAgentInvocationStore.name)
    constructor(
        @InjectRepository(AgentInvocationEntity) private readonly repository: Repository<AgentInvocationEntity>,
        @Optional() private readonly events?: EventBus
    ) {
        super()
    }

    async insert(record: StoredAgentInvocation): Promise<boolean> {
        const { invocation } = record
        // RETURNING is deliberate: TypeORM identifiers can contain the attempted id on conflict.
        return this.repository.manager.transaction(async (manager) => {
            const result = await manager
                .getRepository(AgentInvocationEntity)
                .createQueryBuilder()
                .insert()
                .values({
                    id: invocation.id,
                    tenantId: invocation.scope.tenantId,
                    organizationId: invocation.scope.organizationId,
                    ownerId: invocation.scope.userId,
                    revision: invocation.revision,
                    invocation: () => ':invocation::jsonb',
                    providerSource: () => ':providerSource::jsonb'
                })
                .setParameters({
                    invocation: JSON.stringify(invocation),
                    providerSource: JSON.stringify(record.providerSource)
                })
                .orIgnore()
                .returning('id')
                .execute()
            const inserted = Array.isArray(result.raw) && result.raw.length === 1
            if (inserted) await this.appendEvent(manager, record)
            return inserted
        })
    }

    async read(id: string, scope: AgentInvocationScope): Promise<StoredAgentInvocation | undefined> {
        const entity = await this.repository.findOneBy({
            id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            ownerId: scope.userId
        })
        return entity ? { invocation: entity.invocation, providerSource: entity.providerSource } : undefined
    }

    async replace(record: StoredAgentInvocation, expectedRevision: number): Promise<boolean> {
        const { invocation } = record
        const committed = await this.repository.manager.transaction(async (manager) => {
            const result = await manager
                .getRepository(AgentInvocationEntity)
                .createQueryBuilder()
                .update()
                .set({
                    invocation: () => ':invocation::jsonb',
                    providerSource: () => ':providerSource::jsonb',
                    revision: invocation.revision,
                    nextObservationAt: new Date()
                })
                .where({
                    id: invocation.id,
                    tenantId: invocation.scope.tenantId,
                    organizationId: invocation.scope.organizationId,
                    ownerId: invocation.scope.userId,
                    revision: expectedRevision
                })
                .setParameters({
                    invocation: JSON.stringify(invocation),
                    providerSource: JSON.stringify(record.providerSource)
                })
                .execute()
            if (result.affected !== 1) return false
            await this.appendEvent(manager, record)
            return true
        })
        if (committed && ['succeeded', 'failed', 'cancelled', 'waiting'].includes(invocation.status)) {
            // The due-time update is already durable; a local notification must not undo a committed result.
            try {
                this.events?.publish(new TaskObservationCommittedEvent())
            } catch {
                this.logger.warn('Task observation notification deferred to polling')
            }
        }
        return committed
    }

    private async appendEvent(manager: EntityManager, record: StoredAgentInvocation) {
        const { invocation } = record
        const observation = {
            status: invocation.status,
            handle: invocation.handle,
            interaction: invocation.interaction,
            progress: invocation.progress,
            result: invocation.result,
            error: invocation.error
        }
        await manager
            .getRepository(AgentInvocationEventEntity)
            .createQueryBuilder()
            .insert()
            .values({
                id: randomUUID(),
                invocationId: invocation.id,
                revision: invocation.revision,
                ownerId: invocation.scope.userId,
                tenantId: invocation.scope.tenantId,
                organizationId: invocation.scope.organizationId,
                observation: () => ':observation::jsonb'
            })
            .setParameters({ observation: JSON.stringify(observation) })
            .execute()
        await appendRuntimeDelivery(manager, invocation)
        // Completion and its durable wake-up are committed together. Polling repairs missed notifications.
        if (['succeeded', 'failed', 'cancelled', 'waiting'].includes(invocation.status)) {
            await manager.query(
                `UPDATE agent_invocation_wait SET "nextCheckAt" = now()
                WHERE "tenantId" = $1 AND "organizationId" = $2 AND "ownerId" = $3 AND state = 'waiting'
                AND (id = $4::uuid OR request->'taskIds' ? $4::text)`,
                [invocation.scope.tenantId, invocation.scope.organizationId, invocation.scope.userId, invocation.id]
            )
        }
    }
}
