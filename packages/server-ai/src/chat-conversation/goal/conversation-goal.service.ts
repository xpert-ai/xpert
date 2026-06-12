import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    IThreadGoal,
    ThreadGoalSpec,
    ThreadGoalModelStatus,
    ThreadGoalUserStatus,
    TThreadGoalPatchRequest,
    TThreadGoalSetRequest,
    XpertAgentExecutionStatusEnum,
    createThreadGoalClearedEvent
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { DeepPartial, IsNull, Repository } from 'typeorm'
import { RedisSseStreamService } from '../../shared/stream'
import { FindAgentExecutionsQuery } from '../../xpert-agent-execution/queries'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationGoal } from './conversation-goal.entity'

type GoalUsageDelta = {
    totalTokens?: number
    elapsedSeconds?: number
}

@Injectable()
export class ChatConversationGoalService extends TenantOrganizationAwareCrudService<ChatConversationGoal> {
    private readonly logger = new Logger(ChatConversationGoalService.name)

    constructor(
        @InjectRepository(ChatConversationGoal)
        public repository: Repository<ChatConversationGoal>,
        private readonly conversationService: ChatConversationService,
        private readonly queryBus: QueryBus,
        private readonly redisSseStreamService: RedisSseStreamService
    ) {
        super(repository)
    }

    async getByConversationId(conversationId: string): Promise<ChatConversationGoal | null> {
        const normalizedConversationId = this.normalizeId(conversationId, 'conversationId')
        const result = await this.findAllInOrganizationOrTenant({
            where: {
                conversationId: normalizedConversationId
            },
            take: 1
        })
        return result.items[0] ?? null
    }

    async setGoalFromUser(conversationId: string, request: TThreadGoalSetRequest): Promise<ChatConversationGoal> {
        const conversation = await this.conversationService.findOneInOrganizationOrTenant(
            this.normalizeId(conversationId, 'conversationId')
        )
        const objective = this.normalizeObjective(request.objective)
        const goalSpec = this.buildGoalSpec(objective)
        const existing = await this.getByConversationId(conversation.id)
        const now = new Date()
        const entity: DeepPartial<ChatConversationGoal> = {
            ...(existing ? { id: existing.id } : {}),
            conversationId: conversation.id,
            threadId: conversation.threadId,
            objective,
            goalSpec,
            status: 'active',
            tokensUsed: 0,
            elapsedSeconds: 0,
            continuationCount: 0,
            statusUpdatedAt: now,
            completedAt: null,
            blockedAt: null
        }

        return this.save(entity)
    }

    async patchGoalFromUser(conversationId: string, request: TThreadGoalPatchRequest): Promise<ChatConversationGoal> {
        const goal = await this.requireGoal(conversationId)
        const now = new Date()
        const status = request.status ? this.normalizeUserStatus(request.status) : goal.status
        const objective = request.objective === undefined ? goal.objective : this.normalizeObjective(request.objective)
        const goalSpec = request.objective === undefined ? undefined : this.buildGoalSpec(objective)
        const completedAt = status !== goal.status ? null : (goal.completedAt ?? null)
        const blockedAt = status !== goal.status ? null : (goal.blockedAt ?? null)
        const patch: DeepPartial<ChatConversationGoal> = {
            id: goal.id,
            objective,
            status,
            ...(goalSpec ? { goalSpec } : {}),
            ...(status !== goal.status
                ? {
                      statusUpdatedAt: now,
                      completedAt,
                      blockedAt
                  }
                : {})
        }

        const saved = await this.save(patch)
        return {
            ...goal,
            ...saved,
            objective,
            ...(goalSpec ? { goalSpec } : {}),
            status,
            ...(status !== goal.status
                ? {
                      statusUpdatedAt: now,
                      completedAt,
                      blockedAt
                  }
                : {})
        }
    }

    async clearGoalFromUser(conversationId: string): Promise<ChatConversationGoal | null> {
        const goal = await this.getByConversationId(conversationId)
        if (!goal?.id) {
            return null
        }
        await this.delete(goal.id)
        await this.publishGoalClearedEvent(goal)
        return goal
    }

    async updateGoalFromModel(conversationId: string, status: ThreadGoalModelStatus): Promise<IThreadGoal> {
        const normalizedStatus = this.normalizeModelStatus(status)
        const goal = await this.requireGoal(conversationId)
        const now = new Date()
        const completedAt = normalizedStatus === 'complete' ? now : (goal.completedAt ?? null)
        const blockedAt = normalizedStatus === 'blocked' ? now : (goal.blockedAt ?? null)
        const saved = await this.save({
            id: goal.id,
            status: normalizedStatus,
            statusUpdatedAt: now,
            completedAt,
            blockedAt
        })
        return {
            ...goal,
            ...saved,
            status: normalizedStatus,
            statusUpdatedAt: now,
            completedAt,
            blockedAt
        }
    }

    async addUsage(conversationId: string, delta: GoalUsageDelta): Promise<ChatConversationGoal | null> {
        const goal = await this.getByConversationId(conversationId)
        if (!goal) {
            return null
        }

        const totalTokens = this.normalizeUsageNumber(delta.totalTokens)
        const elapsedSecondsDelta = this.normalizeUsageNumber(delta.elapsedSeconds)
        if (totalTokens === 0 && elapsedSecondsDelta === 0) {
            return goal
        }

        const tokensUsed = this.normalizeUsageNumber(goal.tokensUsed) + totalTokens
        const elapsedSeconds = this.normalizeUsageNumber(goal.elapsedSeconds) + elapsedSecondsDelta
        const saved = await this.save({
            id: goal.id,
            tokensUsed,
            elapsedSeconds
        })
        return {
            ...goal,
            ...saved,
            tokensUsed,
            elapsedSeconds
        }
    }

    async incrementContinuation(conversationId: string): Promise<ChatConversationGoal | null> {
        const goal = await this.getByConversationId(conversationId)
        if (!goal) {
            return null
        }

        const continuationCount = this.normalizeUsageNumber(goal.continuationCount) + 1
        const saved = await this.save({
            id: goal.id,
            continuationCount
        })
        return {
            ...goal,
            ...saved,
            continuationCount
        }
    }

    async markBudgetLimited(conversationId: string): Promise<ChatConversationGoal | null> {
        const goal = await this.getByConversationId(conversationId)
        if (!goal) {
            return null
        }

        const statusUpdatedAt = new Date()
        const saved = await this.save({
            id: goal.id,
            status: 'budget_limited',
            statusUpdatedAt
        })
        return {
            ...goal,
            ...saved,
            status: 'budget_limited',
            statusUpdatedAt
        }
    }

    private async requireGoal(conversationId: string): Promise<ChatConversationGoal> {
        const goal = await this.getByConversationId(conversationId)
        if (!goal) {
            throw new NotFoundException(`Goal for conversation "${conversationId}" not found`)
        }
        return goal
    }

    private normalizeId(value: string, name: string): string {
        const normalized = typeof value === 'string' ? value.trim() : ''
        if (!normalized) {
            throw new BadRequestException(`${name} is required`)
        }
        return normalized
    }

    private normalizeObjective(value: string | undefined): string {
        const objective = typeof value === 'string' ? value.trim() : ''
        if (!objective) {
            throw new BadRequestException('Goal objective is required')
        }
        return objective
    }

    private normalizeUsageNumber(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return Math.floor(value)
        }
        return 0
    }

    private buildGoalSpec(objective: string): ThreadGoalSpec {
        return {
            originalObjective: objective,
            executableGoal: `Work toward this goal: ${objective}`,
            successCriteria: [`The requested goal is complete: ${objective}`],
            constraints: ['Do not change unrelated behavior unless required by the goal.'],
            verificationChecklist: ['Verify that the requested goal has been completed.'],
            recommendedStrategy: 'act_then_verify',
            source: 'system',
            generatedAt: new Date().toISOString()
        }
    }

    private normalizeUserStatus(status: ThreadGoalUserStatus): ThreadGoalUserStatus {
        if (status !== 'active' && status !== 'paused') {
            throw new BadRequestException('User goal status updates only support active or paused')
        }
        return status
    }

    private normalizeModelStatus(status: ThreadGoalModelStatus): ThreadGoalModelStatus {
        if (status !== 'complete' && status !== 'blocked') {
            throw new BadRequestException('Model goal status updates only support complete or blocked')
        }
        return status
    }

    private async publishGoalClearedEvent(goal: ChatConversationGoal) {
        const threadId = goal.threadId?.trim()
        if (!threadId) {
            return
        }

        try {
            const result = await this.queryBus.execute<
                FindAgentExecutionsQuery,
                { items: Array<{ id?: string | null }> }
            >(
                new FindAgentExecutionsQuery({
                    where: {
                        threadId,
                        status: XpertAgentExecutionStatusEnum.RUNNING,
                        parentId: IsNull()
                    },
                    order: {
                        createdAt: 'DESC'
                    },
                    take: 1
                })
            )
            const runId = result.items[0]?.id?.trim()
            if (!runId) {
                return
            }

            await this.redisSseStreamService.appendEvent(threadId, runId, {
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                data: createThreadGoalClearedEvent({
                    conversationId: goal.conversationId,
                    threadId
                })
            })
        } catch (error) {
            this.logger.warn(`Failed to publish thread goal cleared event: ${this.getErrorMessage(error)}`)
        }
    }

    private getErrorMessage(error: unknown) {
        if (error instanceof Error) {
            return error.message
        }
        return typeof error === 'string' ? error : 'Unknown error'
    }
}
