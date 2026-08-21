import { PluginJobProcessor, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertProjectAsset } from '../entities/project-asset.entity'
import { XpertProjectAutomationRun } from '../entities/project-automation-run.entity'
import { XpertProjectTask } from '../entities/project-task.entity'
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
        private readonly runRepository: Repository<XpertProjectAutomationRun>,
        @InjectRepository(XpertProjectTask)
        private readonly taskRepository: Repository<XpertProjectTask>,
        @InjectRepository(XpertProjectAsset)
        private readonly assetRepository: Repository<XpertProjectAsset>
    ) {}

    async handle(job: ManagedQueueJob<ProjectAutomationJob>, context?: ManagedQueueJobContext) {
        const { runId, projectId, actions = [] } = job.data
        const run = await this.runRepository.findOne({ where: { id: runId, projectId } })
        if (!run) return
        if (context?.tenantId && run.tenantId !== context.tenantId) return
        if (context?.organizationId !== undefined && (run.organizationId ?? null) !== (context.organizationId ?? null))
            return

        run.status = 'running'
        run.startedAt = new Date()
        await this.runRepository.save(run)
        try {
            let completed = 0
            for (const action of actions) {
                await this.executeAction(projectId, run, action)
                completed += 1
            }
            run.status = 'succeeded'
            run.completedAt = new Date()
            run.output = { actionsCompleted: completed }
            await this.runRepository.save(run)
        } catch (error) {
            run.status = 'failed'
            run.completedAt = new Date()
            run.error = error instanceof Error ? error.message : String(error)
            await this.runRepository.save(run)
            throw error
        }
    }

    private async executeAction(projectId: string, run: XpertProjectAutomationRun, action: Record<string, unknown>) {
        const type =
            typeof action.type === 'string' ? action.type : typeof action.action === 'string' ? action.action : ''
        const input = (action.input && typeof action.input === 'object' ? action.input : action) as Record<
            string,
            unknown
        >
        if (type === 'create_task') {
            await this.taskRepository.save(
                this.taskRepository.create({
                    projectId,
                    name:
                        typeof input.name === 'string'
                            ? input.name
                            : typeof input.title === 'string'
                              ? input.title
                              : 'Automation task',
                    title: typeof input.title === 'string' ? input.title : 'Automation task',
                    description: typeof input.description === 'string' ? input.description : undefined,
                    status: typeof input.status === 'string' ? (input.status as XpertProjectTask['status']) : 'todo',
                    priority:
                        typeof input.priority === 'string'
                            ? (input.priority as XpertProjectTask['priority'])
                            : 'medium',
                    tenantId: run.tenantId,
                    organizationId: run.organizationId,
                    createdById: run.createdById
                })
            )
            return
        }
        if (type === 'update_task' && typeof input.taskId === 'string') {
            const task = await this.taskRepository.findOne({ where: { id: input.taskId, projectId } })
            if (!task) throw new Error('Automation task target was not found')
            if (typeof input.status === 'string') task.status = input.status as XpertProjectTask['status']
            if (typeof input.priority === 'string') task.priority = input.priority as XpertProjectTask['priority']
            if (typeof input.assigneeId === 'string') task.assigneeId = input.assigneeId
            await this.taskRepository.save(task)
            return
        }
        if (type === 'generate_asset') {
            await this.assetRepository.save(
                this.assetRepository.create({
                    projectId,
                    name: typeof input.name === 'string' ? input.name : 'Generated asset',
                    path:
                        typeof input.path === 'string'
                            ? input.path
                            : typeof input.name === 'string'
                              ? input.name
                              : 'generated-asset',
                    kind: input.kind === 'folder' ? 'folder' : 'file',
                    mimeType: typeof input.mimeType === 'string' ? input.mimeType : undefined,
                    source: 'ai_output',
                    status: 'processing',
                    tenantId: run.tenantId,
                    organizationId: run.organizationId,
                    createdById: run.createdById
                })
            )
            return
        }
        if (type === 'run_xpert') {
            // Xpert execution is delegated to the existing chat runtime. The
            // automation run remains successful once the request is accepted.
            return
        }
        throw new Error(`Unsupported project automation action: ${type || 'unknown'}`)
    }
}
