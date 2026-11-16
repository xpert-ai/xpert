import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectContentService } from '../../services/project-content.service'
import { XpertProjectService } from '../../project.service'
import { InstallProjectSkillCommand, ListProjectSkillsCommand } from '../project-skills.command'

@CommandHandler(ListProjectSkillsCommand)
export class ListProjectSkillsHandler implements ICommandHandler<ListProjectSkillsCommand> {
    constructor(
        private readonly content: XpertProjectContentService,
        private readonly projects: XpertProjectService
    ) {}
    async execute(command: ListProjectSkillsCommand) {
        await this.projects.assertToolPermission(command.projectId, command.action)
        return this.content.listSkills(command.projectId)
    }
}

@CommandHandler(InstallProjectSkillCommand)
export class InstallProjectSkillHandler implements ICommandHandler<InstallProjectSkillCommand> {
    constructor(
        private readonly content: XpertProjectContentService,
        private readonly projects: XpertProjectService
    ) {}
    async execute(command: InstallProjectSkillCommand) {
        await this.projects.assertToolPermission(command.projectId, 'edit')
        return this.content.installSkill(command.projectId, command.indexId, {
            onlyIfMissing: true,
            repositoryIds: command.repositoryIds
        })
    }
}
