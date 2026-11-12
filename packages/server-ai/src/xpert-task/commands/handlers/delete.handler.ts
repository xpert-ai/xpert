import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IsNull } from 'typeorm'
import { t } from 'i18next'
import { XpertTaskService } from '../../xpert-task.service'
import { DeleteXpertTaskCommand } from '../delete.command'

@CommandHandler(DeleteXpertTaskCommand)
export class DeleteXpertTaskHandler implements ICommandHandler<DeleteXpertTaskCommand> {
    constructor(private readonly tasks: XpertTaskService) {}

    async execute(command: DeleteXpertTaskCommand) {
        if (!command.name?.trim() || !command.xpertId)
            throw new BadRequestException(t('server-ai:Error.XpertTaskNotFound'))
        const { items } = await this.tasks.findAll({
            where: {
                createdById: RequestContext.currentUserId(),
                xpertId: command.xpertId,
                projectId: command.projectId ?? IsNull(),
                name: command.name,
                ...(command.taskId ? { id: command.taskId } : {})
            },
            take: 2
        })
        if (!items.length) return `No tasks found for '${command.name}'`
        if (items.length > 1) throw new BadRequestException(t('server-ai:Error.AmbiguousTaskName'))
        await this.tasks.deleteHttpTask(items[0].id)
        return `Task '${command.name}' deleted`
    }
}
