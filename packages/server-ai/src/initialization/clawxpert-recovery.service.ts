// Invariants: recovery uses the membership bootstrap job and its stable per-user ID.
// No caller-supplied tenant, organization, or user can select a different scope.
import { AssistantBindingScope, AssistantCode, RolesEnum, ClawXpertRecoveryStatus } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserOrganizationService } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { Queue } from 'bull'
import { t } from 'i18next'
import { AssistantBindingService } from '../assistant-binding'
import { ServerAIBootstrapService } from './bootstrap.service'
import { AI_BOOTSTRAP_QUEUE, AI_USER_ORGANIZATION_BOOTSTRAP_JOB } from './constants'

@Injectable()
export class ClawXpertRecoveryService {
    constructor(
        @InjectQueue(AI_BOOTSTRAP_QUEUE) private readonly queue: Queue,
        private readonly bindings: AssistantBindingService,
        private readonly bootstrap: ServerAIBootstrapService,
        private readonly memberships: UserOrganizationService
    ) {}

    private async requireCurrentMember() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId) {
            throw new ForbiddenException(t('server-ai:Error.ClawXpertRecoveryRequiresMember'))
        }
        const isActiveMember = await this.memberships.count({
            where: { tenantId, organizationId, userId, isActive: true }
        })
        if (!isActiveMember) {
            throw new ForbiddenException(t('server-ai:Error.ClawXpertRecoveryRequiresMember'))
        }
        return { tenantId, organizationId, userId }
    }

    async getStatus(): Promise<ClawXpertRecoveryStatus> {
        const scope = await this.requireCurrentMember()
        const [binding, candidates, job] = await Promise.all([
            this.bindings.getBinding(AssistantCode.CLAWXPERT, AssistantBindingScope.USER),
            this.bindings.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT),
            this.queue.getJob(`user-org-bootstrap:${scope.organizationId}:${scope.userId}`)
        ])
        const base = {
            checkedAt: new Date().toISOString(),
            binding,
            candidates: candidates.map(({ id, name, title, workspaceId }) => ({ id, name, title, workspaceId })),
            canRecover: RequestContext.currentUser()?.role?.name !== RolesEnum.SUPER_ADMIN
        }
        if (binding?.assistantId && candidates.some((candidate) => candidate.id === binding.assistantId)) {
            return { ...base, status: 'ready', code: 'ready' }
        }
        if (!base.canRecover) {
            return { ...base, status: 'dependency_unavailable', code: 'personal_workspace_unavailable' }
        }
        const jobState = await job?.getState()
        if (jobState && ['active', 'waiting', 'delayed', 'paused'].includes(jobState)) {
            return { ...base, status: 'initializing', code: 'initialization_running' }
        }
        if (!(await this.bootstrap.getAvailableClawXpertModel())) {
            return { ...base, status: 'dependency_unavailable', code: 'model_required' }
        }
        if (jobState === 'failed') {
            return { ...base, status: 'error', code: 'initialization_failed' }
        }
        return binding?.assistantId
            ? { ...base, status: 'binding_inaccessible', code: 'binding_inaccessible' }
            : { ...base, status: 'missing', code: 'binding_missing' }
    }

    async recover(): Promise<ClawXpertRecoveryStatus> {
        const scope = await this.requireCurrentMember()
        const status = await this.getStatus()
        if (
            status.status === 'ready' ||
            status.status === 'initializing' ||
            status.status === 'dependency_unavailable'
        ) {
            return status
        }
        const jobId = `user-org-bootstrap:${scope.organizationId}:${scope.userId}`
        const existing = await this.queue.getJob(jobId)
        if (existing && (await existing.getState()) === 'failed') {
            // Bull atomically retries only failed jobs, so concurrent clicks cannot enqueue duplicates.
            try {
                await existing.retry()
            } catch (error) {
                const state = await existing.getState()
                if (!['active', 'waiting', 'delayed', 'completed'].includes(state)) throw error
            }
        } else {
            await this.queue.add(AI_USER_ORGANIZATION_BOOTSTRAP_JOB, scope, {
                jobId,
                attempts: 3,
                backoff: 10_000,
                removeOnComplete: true
            })
        }
        return {
            ...status,
            checkedAt: new Date().toISOString(),
            status: 'initializing',
            code: 'initialization_running'
        }
    }
}
