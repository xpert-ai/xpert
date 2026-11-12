import type { ProjectConfigurationApi } from '@xpert-ai/plugin-sdk'
import { Injectable, ForbiddenException, Inject, forwardRef } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ScheduleTaskStatus } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { XpertTaskService } from '../../../xpert-task/xpert-task.service'
import { CreateXpertTaskCommand } from '../../../xpert-task/commands'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { ConnectorService } from '../../../connector/connector.service'

@Injectable()
export class ProjectConfigurationAutomationAdapter {
    constructor(@Inject(forwardRef(() => XpertTaskService)) private readonly tasks: XpertTaskService, private readonly access: XpertProjectAccessService,
        private readonly connectors: ConnectorService, private readonly commands: CommandBus) {}

    async listAutomations(projectId: string, input: Parameters<ProjectConfigurationApi['listAutomations']>[1]): ReturnType<ProjectConfigurationApi['listAutomations']> {
        const { page } = input
        const result = await this.tasks.findHttpAccessible({ where: { projectId }, skip: (page - 1) * 20, take: 20, order: { createdAt: 'DESC' } })
        return { ...result, items: result.items.map((task) => ({ id: task.id, name: task.name, prompt: task.prompt,
            xpertId: task.xpertId, agentKey: task.agentKey, options: task.options, timeZone: task.timeZone, status: task.status,
            scheduleDescription: task.scheduleDescription, runAsUserId: task.runAsUserId || task.createdById,
            pendingRunAsUserId: task.pendingRunAsUserId, runtimeState: task.runtimeState })), page }
    }
    async getAutomationOptions(projectId: string, input: Parameters<ProjectConfigurationApi['getAutomationOptions']>[1]): ReturnType<ProjectConfigurationApi['getAutomationOptions']> {
        const { xpertId, agentKey } = input
        await this.access.assertCanUseXpert(projectId, xpertId)
        const [capabilities, connectors] = await Promise.all([
            this.tasks.getScheduleCapabilities(xpertId, agentKey), this.connectors.runtimeOptions(xpertId, projectId)
        ])
        return { capabilities, connectors }
    }
    async saveAutomation(projectId: string, input: Parameters<ProjectConfigurationApi['saveAutomation']>[1]): ReturnType<ProjectConfigurationApi['saveAutomation']> {
        await this.access.assertCanManage(projectId)
        await this.access.assertCanUseXpert(projectId, input.xpertId)
        const { taskId, options, ...rest } = input
        const values = { ...rest, options: { ...options, frequency: options.frequency, time: options.time } }
        if (taskId) {
            await this.assertTask(projectId, taskId)
            await this.tasks.updateHttpTask(taskId, { ...values, status: ScheduleTaskStatus.SCHEDULED })
        } else await this.commands.execute(new CreateXpertTaskCommand({ ...values, projectId }))
        return null
    }
    async pauseAutomation(projectId: string, input: Parameters<ProjectConfigurationApi['pauseAutomation']>[1]): ReturnType<ProjectConfigurationApi['pauseAutomation']> {
        const task = await this.assertTask(projectId, input.taskId)
        await this.access.assertCanManage(projectId)
        await this.tasks.pauseHttpTask(task.id)
        return null
    }
    async resumeAutomation(projectId: string, input: Parameters<ProjectConfigurationApi['resumeAutomation']>[1]): ReturnType<ProjectConfigurationApi['resumeAutomation']> {
        const task = await this.assertTask(projectId, input.taskId)
        await this.access.assertCanManage(projectId)
        await this.tasks.scheduleHttpTask(task.id)
        return null
    }
    async deleteAutomation(projectId: string, input: Parameters<ProjectConfigurationApi['deleteAutomation']>[1]): ReturnType<ProjectConfigurationApi['deleteAutomation']> {
        const task = await this.assertTask(projectId, input.taskId)
        await this.access.assertCanManage(projectId)
        await this.tasks.deleteHttpTask(task.id)
        return null
    }
    async proposeAutomationRunAs(projectId: string, input: Parameters<ProjectConfigurationApi['proposeAutomationRunAs']>[1]): ReturnType<ProjectConfigurationApi['proposeAutomationRunAs']> {
        const task = await this.assertTask(projectId, input.taskId)
        await this.tasks.proposeProjectTaskRunAs(task.id, input.userId)
        return null
    }
    async acceptAutomationRunAs(projectId: string, input: Parameters<ProjectConfigurationApi['acceptAutomationRunAs']>[1]): ReturnType<ProjectConfigurationApi['acceptAutomationRunAs']> {
        const task = await this.assertTask(projectId, input.taskId)
        await this.tasks.acceptProjectTaskRunAs(task.id)
        return null
    }
    async updateAutomationConnectors(projectId: string, input: Parameters<ProjectConfigurationApi['updateAutomationConnectors']>[1]): ReturnType<ProjectConfigurationApi['updateAutomationConnectors']> {
        const task = await this.assertTask(projectId, input.taskId)
        // The task service restricts a confirmed run-as user to runtime connector selection.
        await this.tasks.updateHttpTask(task.id, { runtimeState: input.runtimeState })
        return null
    }
    private async assertTask(projectId: string, id: string) {
        const task = await this.tasks.findHttpAccessibleById(id)
        if (task.projectId !== projectId) throw new ForbiddenException(t('server-ai:Error.XpertTaskNotFound'))
        return task
    }
}
