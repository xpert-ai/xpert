import { randomUUID } from 'node:crypto'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type EntityManager } from 'typeorm'
import {
    AIPermissionsEnum,
    type ExecutionReviewApi,
    type ExecutionReviewDecision,
    type ExecutionReviewItem,
    type ExecutionReviewQuery,
    type ExecutionReviewReceipt,
    type ExecutionReviewSubmission
} from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { EvolutionRuntimeStore } from '../application/evolution-runtime.store'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { ExecutionReviewEntity, LearningEventEntity } from '../entities'

type ReviewScope = { tenantId: string; organizationId: string; userId: string; projectId: string; xpertId: string }
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

@Injectable()
export class ExecutionReviewService {
    constructor(
        @InjectDataSource() private readonly db: DataSource,
        private readonly commands: CommandBus,
        private readonly registry: EvolutionTargetProviderRegistry,
        private readonly store: AgentEvolutionStore
    ) {}

    bind(scope: ReviewScope, feature: string): ExecutionReviewApi {
        const authorize = async (targetId: string) => {
            if (
                !RequestContext.hasPermission(AIPermissionsEnum.EVOLUTION_REVIEW, false) ||
                RequestContext.currentTenantId() !== scope.tenantId ||
                RequestContext.getOrganizationId() !== scope.organizationId ||
                RequestContext.currentUserId() !== scope.userId
            )
                throw new ForbiddenException()
            await this.commands.execute(new AssertProjectAssistantAccessCommand(scope.projectId, scope.xpertId))
            const target = this.registry.get(targetId, scope.organizationId)
            if (
                target.descriptor.status !== 'active' ||
                !target.feedback?.workbench ||
                target.feedback.workbench.feature !== feature
            )
                throw new ForbiddenException()
            return { targetId, feedback: target.feedback, adapter: target.feedback.workbench }
        }
        type Target = Awaited<ReturnType<typeof authorize>>
        const query = (manager: EntityManager, target: Target) =>
            manager
                .getRepository(XpertAgentExecution)
                .createQueryBuilder('e')
                .leftJoin(
                    ChatConversationThread,
                    't',
                    't."threadId" = e."threadId" AND t."tenantId" = e."tenantId" AND t."organizationId" = e."organizationId"'
                )
                .innerJoin(
                    ChatConversation,
                    'c',
                    '(c.id = t."conversationId" OR (t.id IS NULL AND c."threadId" = e."threadId")) AND c."tenantId" = e."tenantId" AND c."organizationId" = e."organizationId"'
                )
                .leftJoin(
                    ExecutionReviewEntity,
                    'r',
                    'r."executionId" = e.id AND r."targetId" = :targetId AND r."tenantId" = e."tenantId" AND r."organizationId" = e."organizationId"'
                )
                .where(
                    'e."tenantId" = :tenantId AND e."organizationId" = :organizationId AND c."projectId" = :projectId AND c."xpertId" = :xpertId',
                    scope
                )
                .andWhere("c.purpose = 'private' AND e.status = 'success' AND e.type = :type", {
                    type: target.feedback.executionType
                })
                .setParameter('targetId', target.targetId)
        const row = async (manager: EntityManager, target: Target, id: string) => {
            if (!uuid.test(id)) throw new BadRequestException('invalid_execution_id')
            const qb = query(manager, target).andWhere('e.id = :id', { id }).addSelect('c.id', 'conversation_id')
            const { raw, entities } = await qb.getRawAndEntities<{ conversation_id: string }>()
            const run = entities[0],
                conversationId = raw[0]?.conversation_id
            if (!run?.threadId || !conversationId) throw new NotFoundException()
            const snap = target.adapter.snapshot(run)
            // Link via the persisted reply's exact execution and parent, including older outputs without a source ID.
            const parent = run.parentId
                ? await manager.getRepository(ChatMessage).findOneBy({
                      tenantId: scope.tenantId,
                      organizationId: scope.organizationId,
                      conversationId,
                      executionId: run.parentId,
                      role: 'ai'
                  })
                : null
            const sourceId = snap.sourceMessageId || parent?.parentId
            const source =
                sourceId && uuid.test(sourceId) && (!parent || parent.parentId === sourceId)
                    ? await manager.getRepository(ChatMessage).findOneBy({
                          id: sourceId,
                          tenantId: scope.tenantId,
                          organizationId: scope.organizationId,
                          conversationId,
                          role: 'human'
                      })
                    : null
            const text =
                source &&
                (source.createdInThreadId === run.threadId ||
                    (!source.createdInThreadId && parent?.parentId === source.id)) &&
                typeof source.content === 'string' &&
                target.adapter.sourceMatches(run, source.content)
                    ? source.content
                    : null
            const identity = {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                targetId: target.targetId,
                executionId: id
            }
            const record = await manager.getRepository(ExecutionReviewEntity).findOneBy(identity)
            const item: ExecutionReviewItem = {
                ...snap,
                executionId: id,
                threadId: run.threadId,
                conversationId,
                sourceText:
                    text
                        ?.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
                        .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[phone]') ?? null,
                createdAt: run.createdAt.toISOString(),
                ...(record ? { receipt: record.receipt } : {})
            }
            return { run, item, identity }
        }
        return {
            list: async (id, q: ExecutionReviewQuery) => {
                const target = await authorize(id)
                if (
                    !['pending', 'reviewed', 'insufficient'].includes(q.queue) ||
                    !Number.isInteger(q.page) ||
                    q.page < 1 ||
                    !Number.isInteger(q.pageSize) ||
                    q.pageSize < 1 ||
                    q.pageSize > 50
                )
                    throw new BadRequestException('invalid_review_page')
                const qb = query(this.db.manager, target)
                if (q.queue === 'pending')
                    qb.andWhere('r.id IS NULL').andWhere(`NOT EXISTS (SELECT 1 FROM agent_evolution_learning_event l
                    WHERE l."tenantId" = e."tenantId" AND l."organizationId" = e."organizationId" AND l."targetId" = :targetId AND l.value->>'executionId' = e.id::text)`)
                else
                    qb.andWhere(
                        q.queue === 'reviewed'
                            ? "r.receipt->>'disposition' <> 'insufficient'"
                            : "r.receipt->>'disposition' = 'insufficient'"
                    )
                const total = await qb.getCount()
                const ids = await qb
                    .select('e.id', 'id')
                    .orderBy('e.createdAt', 'DESC')
                    .addOrderBy('e.id', 'DESC')
                    .offset((q.page - 1) * q.pageSize)
                    .limit(q.pageSize)
                    .getRawMany<{ id: string }>()
                const items = await Promise.all(
                    ids.map(async ({ id }) => (await row(this.db.manager, target, id)).item)
                )
                return { items, total }
            },
            get: async (id, executionId) => (await row(this.db.manager, await authorize(id), executionId)).item,
            submit: async (id, body: ExecutionReviewSubmission) => {
                const target = await authorize(id)
                return this.db.transaction(async (manager) => {
                    await this.lock(manager, scope, id, body.executionId)
                    const { run, item, identity } = await row(manager, target, body.executionId)
                    if (item.bundleHash !== body.bundleHash) throw new ConflictException('review_version_changed')
                    const decision: ExecutionReviewDecision = {
                        disposition: body.disposition,
                        use: body.use,
                        ...(body.expectedLabel ? { expectedLabel: body.expectedLabel } : {}),
                        ...(body.reason ? { reason: body.reason } : {})
                    }
                    if (item.receipt) {
                        const prior = item.receipt
                        if (
                            prior.disposition === decision.disposition &&
                            prior.use === decision.use &&
                            prior.expectedLabel === decision.expectedLabel &&
                            prior.reason === decision.reason
                        )
                            return prior
                        throw new ConflictException('execution_already_reviewed')
                    }
                    const legacy = await manager.getRepository(LearningEventEntity).findOneBy({
                        tenantId: scope.tenantId,
                        organizationId: scope.organizationId,
                        idempotencyKey: target.adapter.legacyKey(body.executionId)
                    })
                    if (legacy) throw new ConflictException('execution_already_reviewed')
                    if (item.sourceText === null && decision.disposition !== 'insufficient')
                        throw new BadRequestException('source_unavailable')
                    const reviewedAt = new Date().toISOString()
                    const plan = target.adapter.prepare(run, decision, {
                        organizationId: scope.organizationId,
                        conversationId: item.conversationId,
                        reviewedAt
                    })
                    const receipt: ExecutionReviewReceipt = {
                        ...decision,
                        receiptId: randomUUID(),
                        executionId: body.executionId,
                        originalLabel: item.originalLabel,
                        versionId: item.versionId,
                        reviewerId: scope.userId,
                        reviewedAt
                    }
                    if (plan.event) {
                        if (
                            decision.disposition !== 'corrected' ||
                            decision.use !== 'similar_cases' ||
                            plan.event.targetId !== id ||
                            plan.event.executionId !== run.id ||
                            plan.event.scope.type !== 'organization' ||
                            plan.event.scope.key !== scope.organizationId ||
                            plan.event.bundleHash !== item.bundleHash
                        )
                            throw new BadRequestException('invalid_review_evidence')
                        const event = await this.store.insertLearningEvent(manager, identity, {
                            ...plan.event,
                            eventId: randomUUID(),
                            createdAt: reviewedAt,
                            reviewStatus: 'pending'
                        })
                        receipt.learningEventId = event.eventId
                    }
                    for (const observation of plan.observations) {
                        if (
                            observation.targetId !== id ||
                            observation.executionId !== run.id ||
                            observation.scope.type !== 'organization' ||
                            observation.scope.key !== scope.organizationId ||
                            !observation.observationId
                        )
                            throw new BadRequestException('invalid_review_observation')
                        await new EvolutionRuntimeStore(this.db).insertRuntimeObservation(manager, identity, {
                            ...observation,
                            observationId: observation.observationId,
                            createdAt: reviewedAt
                        })
                    }
                    await manager.getRepository(ExecutionReviewEntity).insert({
                        ...identity,
                        id: receipt.receiptId,
                        projectId: scope.projectId,
                        conversationId: item.conversationId,
                        bundleHash: item.bundleHash,
                        receipt
                    })
                    return receipt
                })
            }
        }
    }

    async lock(
        manager: EntityManager,
        scope: { tenantId: string; organizationId: string },
        target: string,
        execution: string
    ) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            JSON.stringify(['execution-review', scope.tenantId, scope.organizationId, target, execution])
        ])
    }
}
