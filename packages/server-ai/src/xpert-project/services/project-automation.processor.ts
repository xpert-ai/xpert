import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { XpertProjectAutomationRun } from '../entities/project-automation-run.entity'
import { XPERT_PROJECT_AUTOMATION_PLUGIN, XPERT_PROJECT_AUTOMATION_QUEUE } from './project-automation.service'

type ProjectAutomationJob = {
    runId: string
    projectId: string
    automationId: string
    actions: Array<Record<string, unknown>>
}

@Injectable()
@PluginJobProcessor({
    pluginName: XPERT_PROJECT_AUTOMATION_PLUGIN,
    queueName: XPERT_PROJECT_AUTOMATION_QUEUE,
    jobName: 'run',
    concurrency: 2
})
export class XpertProjectAutomationProcessor {
    constructor(
        @InjectRepository(XpertProjectAutomationRun)
        private readonly runRepository: Repository<XpertProjectAutomationRun>
    ) {}

    async handle(job: ManagedQueueJob<ProjectAutomationJob>, context?: ManagedQueueJobContext) {
        const { runId, projectId } = job.data
        const run = await this.runRepository.findOne({ where: { id: runId, projectId } })
        if (!run) return
        if (context?.tenantId && run.tenantId !== context.tenantId) return
        if (context?.organizationId !== undefined && (run.organizationId ?? null) !== (context.organizationId ?? null))
            return

        run.status = 'failed'
        run.completedAt = new Date()
        const defaultValue = 'Legacy Project automation is disabled; recreate it as a scheduled Xpert task.'
        run.error = t('server-ai:Error.LegacyProjectAutomationDisabled', { defaultValue }) || defaultValue
        await this.runRepository.save(run)
    }
}
