// Invariants: inspect and continuation have separate durable queues and leases.
// A wake-up may resume only its exact checkpoint; it never approves human input or relaunches work.
import { TaskObservationCommittedEvent } from '../runtime-task/task-observation.event'
import { parsePersistedInvocationWait, parseInvocationWaitScope } from './invocation-task-wait.schema'
import { z } from 'zod/v3'
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Interval } from '@nestjs/schedule'
import { CommandBus, QueryBus, EventsHandler } from '@nestjs/cqrs'
import { AgentInvocationApi, AgentInvocationScope, taskWaitReason } from '@xpert-ai/plugin-sdk'
import { UserType, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { LessThanOrEqual, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { lastValueFrom, defaultIfEmpty, ignoreElements } from 'rxjs'
import type { CheckpointTuple } from '@langchain/langgraph-checkpoint'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { CopilotCheckpointGetTupleQuery } from '../copilot-checkpoint/queries/get-tuple.query'
import { RunCreateStreamCommand } from '../ai/commands/run-create-stream.command'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { AgentInvocationEntity, AgentInvocationWaitEntity } from './invocation.entity'
import { AgentInvocationFactoryService } from './invocation-factory.service'
import { AgentInvocationWaitStore } from './invocation-wait.store'
import { invocationInterrupt, invocationWaitInteraction } from './invocation-continuation'
import { invocationDependencyState } from './invocation-task-wait'
import { HOST_TASK_WAIT_POLICY } from '../runtime-task/task-wait-policy'
import { applicationMetrics } from '../metrics/application-metrics'

@Injectable()
@EventsHandler(TaskObservationCommittedEvent)
export class AgentInvocationMonitorService implements OnModuleDestroy {
    private readonly logger = new Logger(AgentInvocationMonitorService.name)
    private busy = false
    private stopping = false
    onModuleDestroy() {
        this.stopping = true
    }
    constructor(
        private readonly waits: AgentInvocationWaitStore,
        @InjectRepository(AgentInvocationEntity) private readonly invocations: Repository<AgentInvocationEntity>,
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(UserOrganization) private readonly memberships: Repository<UserOrganization>,
        @InjectRepository(XpertAgentExecution) private readonly executions: Repository<XpertAgentExecution>,
        private readonly factory: AgentInvocationFactoryService,
        private readonly queries: QueryBus,
        private readonly commands: CommandBus
    ) {}

    handle() {
        void this.reconcile().catch(() => this.logger.warn('Task observation reconciliation deferred'))
    }

    @Interval(5000)
    async reconcile() {
        if (this.busy || this.stopping) return
        this.busy = true
        try {
            const records = await this.waits.records.find({
                where: { state: 'waiting', nextCheckAt: LessThanOrEqual(new Date()) },
                order: { nextCheckAt: 'ASC' },
                take: 10
            })
            const totals = z
                .array(
                    z.object({
                        pending: z.coerce.number().nonnegative(),
                        oldestErrorSeconds: z.coerce.number().nonnegative()
                    })
                )
                .parse(
                    await this.waits.records.query(`SELECT COUNT(*) AS pending,
                    COALESCE(EXTRACT(EPOCH FROM now() - MIN("createdAt") FILTER (WHERE "lastError" IS NOT NULL)), 0) AS "oldestErrorSeconds"
                    FROM agent_invocation_wait WHERE state IN ('waiting', 'ready', 'blocked')`)
                )
            if (totals[0])
                applicationMetrics.setInvocationWait({
                    pending: totals[0].pending,
                    oldestErrorSeconds: totals[0].oldestErrorSeconds
                })
            await Promise.allSettled(records.map((record) => this.process(record)))
        } finally {
            this.busy = false
        }
    }

    async process(wait: AgentInvocationWaitEntity) {
        return this.claim(wait, 'waiting', async (owned) =>
            this.withAccess(wait, async (scope, api) => {
                const tasks = await Promise.all((wait.request?.taskIds ?? [wait.id]).map((id) => api.inspect(id)))
                let outcome = taskWaitReason(tasks.map(invocationDependencyState), wait.request?.mode ?? 'all')
                const unknown = tasks.some((task) => task.status === 'unknown')
                const unknownSince = unknown ? (wait.unknownSince ?? new Date()) : null
                if (outcome === 'attention') {
                    const tuple = await this.checkpoint(wait)
                    const existing = invocationWaitInteraction(tuple, wait.id)
                    if (existing && tasks.some((task) => task.interaction?.id === existing)) {
                        if (wait.deadlineAt && wait.deadlineAt.getTime() <= Date.now()) {
                            await this.waits.records.update(owned, {
                                state: 'blocked',
                                outcome: null,
                                lastError: 'awaiting_user'
                            })
                            return
                        }
                        outcome = undefined
                    }
                }
                if (
                    !outcome &&
                    unknownSince &&
                    Date.now() - unknownSince.getTime() >= HOST_TASK_WAIT_POLICY.unknownGraceMs
                )
                    outcome = 'unavailable'
                if (!outcome && wait.deadlineAt && wait.deadlineAt.getTime() <= Date.now()) outcome = 'timeout'
                await this.waits.records.update(owned, {
                    state: outcome ? 'ready' : 'waiting',
                    outcome: outcome ?? null,
                    unknownSince,
                    lastError: unknown ? 'outcome_unknown' : null,
                    nextCheckAt: new Date(Date.now() + (outcome ? 0 : 15_000))
                })
            })
        )
    }

    /** Called by the independent dispatcher, never awaited by the observation scan. */
    async deliver(wait: AgentInvocationWaitEntity) {
        return this.claim(wait, 'ready', async (owned) =>
            this.withAccess(wait, async (scope, api) => {
                // Revalidate access to every dependency even when its result is already persisted.
                await Promise.all((wait.request?.taskIds ?? [wait.id]).map((id) => api.inspect(id)))
                let execution = await this.executions.findOneBy({
                    id: scope.parentExecutionId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    createdById: scope.userId
                })
                const visited = new Set<string>()
                while (execution?.parentId) {
                    if (visited.has(execution.id) || visited.size >= 64) throw new Error('Invalid execution ancestry')
                    visited.add(execution.id)
                    execution = await this.executions.findOneBy({
                        id: execution.parentId,
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        createdById: scope.userId,
                        threadId: wait.threadId
                    })
                }
                if (execution?.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    await this.waits.records.update(owned, { nextCheckAt: new Date(Date.now() + 5000) })
                    return
                }
                const tuple = await this.checkpoint(wait)
                // A completion queued earlier must not replay a later human-approval checkpoint.
                if (invocationWaitInteraction(tuple, wait.id) !== undefined) {
                    await this.waits.records.update(owned, {
                        state: 'blocked',
                        outcome: null,
                        lastError: 'awaiting_user'
                    })
                    return
                }
                const interruptId = invocationInterrupt(tuple, wait.id)
                if (
                    !execution ||
                    execution.threadId !== wait.threadId ||
                    !tuple ||
                    !interruptId ||
                    ![XpertAgentExecutionStatusEnum.INTERRUPTED, XpertAgentExecutionStatusEnum.ERROR].includes(
                        execution.status
                    )
                ) {
                    await this.waits.records.update(owned, { state: 'stale' })
                    return
                }
                if (this.stopping) return
                const { stream } = await this.commands.execute(
                    new RunCreateStreamCommand(
                        wait.threadId,
                        {
                            assistant_id: execution.xpertId,
                            stream_mode: ['values'],
                            stream_subgraphs: true,
                            on_disconnect: 'continue',
                            multitask_strategy: 'reject',
                            if_not_exists: 'reject',
                            input: {
                                action: 'resume',
                                conversationId: scope.conversationId,
                                target: { executionId: execution.id },
                                decision: {
                                    type: 'confirm',
                                    payload: { [interruptId]: { waitId: wait.id, completed: true } }
                                }
                            }
                        },
                        undefined,
                        {
                            invocationId: wait.id,
                            waitLeaseToken: owned.leaseToken,
                            checkpointNamespace: wait.checkpointNamespace,
                            checkpointId: tuple.checkpoint.id,
                            interruptId
                        }
                    )
                )
                await lastValueFrom(stream.pipe(ignoreElements(), defaultIfEmpty(null)))
                // A new approval/checkpoint may still depend on this group. Keep supervising it.
                const pending = invocationInterrupt(await this.checkpoint(wait), wait.id)
                await this.waits.records.update(owned, {
                    state: pending ? 'waiting' : 'delivered',
                    outcome: pending ? null : wait.outcome,
                    lastError: null,
                    nextCheckAt: new Date(Date.now() + 5000)
                })
            })
        )
    }

    private checkpoint(wait: AgentInvocationWaitEntity) {
        return this.queries.execute<CopilotCheckpointGetTupleQuery, CheckpointTuple | undefined>(
            new CopilotCheckpointGetTupleQuery({ thread_id: wait.threadId, checkpoint_ns: wait.checkpointNamespace })
        )
    }

    private async withAccess(
        wait: AgentInvocationWaitEntity,
        action: (scope: AgentInvocationScope, api: AgentInvocationApi) => Promise<void>
    ) {
        if (wait.request !== null && wait.request !== undefined)
            wait.request = parsePersistedInvocationWait(wait.request)
        const original = wait.request
            ? undefined
            : await this.invocations.findOneBy({
                  id: wait.id,
                  tenantId: wait.tenantId,
                  organizationId: wait.organizationId,
                  ownerId: wait.ownerId
              })
        const scope = parseInvocationWaitScope(wait.request?.scope ?? original?.invocation.scope)
        if (
            !scope ||
            scope.tenantId !== wait.tenantId ||
            scope.organizationId !== wait.organizationId ||
            scope.userId !== wait.ownerId
        )
            throw new Error('Invocation owner unavailable')
        const [user, membership] = await Promise.all([
            this.users.findOne({ where: { id: scope.userId, tenantId: scope.tenantId }, relations: ['role'] }),
            this.memberships.findOne({
                where: {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    userId: scope.userId,
                    isActive: true,
                    organization: { isActive: true }
                }
            })
        ])
        if (!user || user.type !== UserType.USER || !membership) throw new Error('Invocation actor unavailable')
        return runWithCapturedRequestContext(
            captureRequestContext({
                user,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                headers: { 'x-scope-level': 'organization' }
            }),
            async () => {
                const api = this.factory.createScopedApi({
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    userId: scope.userId,
                    workspaceId: scope.workspaceId,
                    projectId: scope.projectId,
                    conversationId: scope.conversationId,
                    executionId: scope.parentExecutionId,
                    agentKey: scope.callerAgentKey,
                    xpertId: scope.callerXpertId
                })
                await action(scope, api)
            }
        )
    }

    private async claim(
        wait: AgentInvocationWaitEntity,
        state: 'waiting' | 'ready',
        action: (owned: { id: string; leaseToken: string }) => Promise<void>
    ) {
        if (this.stopping) return
        const token = randomUUID()
        const claim = await this.waits.records
            .createQueryBuilder()
            .update()
            .set({
                leaseToken: token,
                leaseUntil: new Date(Date.now() + 120_000),
                nextCheckAt: new Date(Date.now() + 15_000)
            })
            .where({
                id: wait.id,
                tenantId: wait.tenantId,
                organizationId: wait.organizationId,
                ownerId: wait.ownerId,
                state
            })
            .andWhere('("leaseUntil" IS NULL OR "leaseUntil" < now())')
            .execute()
        if (!claim.affected) return
        const owned = { id: wait.id, leaseToken: token }
        const heartbeat = setInterval(() => {
            void this.waits.records
                .update(owned, { leaseUntil: new Date(Date.now() + 120_000) })
                .catch(() => this.logger.warn('Task wait lease renewal failed'))
        }, 30_000)
        try {
            await action(owned)
        } catch {
            await this.waits.records.update(owned, {
                state: wait.deadlineAt && wait.deadlineAt.getTime() <= Date.now() ? 'blocked' : state,
                lastError: 'continuation_pending',
                nextCheckAt: new Date(Date.now() + 60_000)
            })
        } finally {
            clearInterval(heartbeat)
            await this.waits.records.update(owned, { leaseToken: null, leaseUntil: null })
        }
    }
}
