import { IXpertProjectAutomation } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService, RequestContext } from '@xpert-ai/server-core'
import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectAutomation } from '../entities/project-automation.entity'
import { XpertProjectAutomationRun } from '../entities/project-automation-run.entity'
import { MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService } from '@xpert-ai/plugin-sdk'

export const XPERT_PROJECT_AUTOMATION_QUEUE = 'xpert-project-automation'
export const XPERT_PROJECT_AUTOMATION_PLUGIN = '@xpert-ai/platform'

@Injectable()
export class XpertProjectAutomationService extends TenantOrganizationAwareCrudService<XpertProjectAutomation> {
    constructor(
        @InjectRepository(XpertProjectAutomation) repository: Repository<XpertProjectAutomation>,
        @InjectRepository(XpertProjectAutomationRun)
        private readonly runRepository: Repository<XpertProjectAutomationRun>,
        @Optional()
        @Inject(MANAGED_QUEUE_SERVICE_TOKEN)
        private readonly queue?: ManagedQueueService
    ) {
        super(repository)
    }

    list(projectId: string) {
        return this.findAll({ where: { projectId }, relations: ['runs'], order: { createdAt: 'DESC' } })
    }

    async createAutomation(projectId: string, input: Partial<IXpertProjectAutomation>) {
        return this.create({
            projectId,
            name: input.name?.trim() || 'New automation',
            enabled: input.enabled ?? false,
            trigger: input.trigger ?? { type: 'task.status_changed' },
            actions: input.actions ?? []
        })
    }

    async updateAutomation(projectId: string, automationId: string, input: Partial<IXpertProjectAutomation>) {
        const automation = await this.findOne({ where: { id: automationId, projectId } })
        if (!automation) throw new NotFoundException('Project automation not found')
        Object.assign(automation, input, { projectId })
        return this.save(automation)
    }

    async removeAutomation(projectId: string, automationId: string) {
        const automation = await this.findOne({ where: { id: automationId, projectId } })
        if (!automation) throw new NotFoundException('Project automation not found')
        await this.repository.softRemove(automation)
    }

    async run(projectId: string, automationId: string, occurrenceKey = `${automationId}:${Date.now()}`) {
        const automation = await this.findOne({ where: { id: automationId, projectId } })
        if (!automation) throw new NotFoundException('Project automation not found')

        const existing = await this.runRepository.findOne({ where: { automationId, occurrenceKey, projectId } })
        if (existing) return existing

        const run = await this.runRepository.save(
            this.runRepository.create({
                projectId,
                automationId,
                occurrenceKey,
                status: 'queued',
                createdById: RequestContext.currentUserId(),
                tenantId: automation.tenantId,
                organizationId: automation.organizationId
            })
        )
        if (!this.queue) return run

        try {
            const queued = await this.queue.enqueue({
                pluginName: XPERT_PROJECT_AUTOMATION_PLUGIN,
                queueName: XPERT_PROJECT_AUTOMATION_QUEUE,
                jobName: 'run',
                payload: {
                    runId: run.id,
                    projectId,
                    automationId,
                    actions: automation.actions
                },
                tenantId: automation.tenantId,
                organizationId: automation.organizationId,
                userId: run.createdById,
                jobId: `project-automation:${run.id}`,
                attempts: 3,
                backoffMs: { type: 'exponential', delay: 1000 }
            })
            run.jobId = queued.jobId
            return this.runRepository.save(run)
        } catch (error) {
            run.status = 'failed'
            run.error = error instanceof Error ? error.message : String(error)
            run.completedAt = new Date()
            await this.runRepository.save(run)
            throw error
        }
    }

    listRuns(projectId: string, automationId?: string) {
        return this.runRepository.find({
            where: { projectId, ...(automationId ? { automationId } : {}) },
            order: { createdAt: 'DESC' },
            take: 100
        })
    }

    async triggerEvent(
        projectId: string,
        eventType: Exclude<IXpertProjectAutomation['trigger']['type'], 'schedule'>,
        entityId?: string
    ) {
        const { items: automations } = await this.list(projectId)
        const triggered = automations.filter((automation) => {
            if (!automation.enabled || automation.trigger.type !== eventType) return false
            return !automation.trigger.eventType || automation.trigger.eventType === eventType
        })
        return Promise.all(
            triggered.map((automation) =>
                this.run(projectId, automation.id, `${automation.id}:${eventType}:${entityId ?? Date.now()}`)
            )
        )
    }
}
