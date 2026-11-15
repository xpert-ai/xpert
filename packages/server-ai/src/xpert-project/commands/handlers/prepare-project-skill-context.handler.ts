import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectContentService } from '../../services/project-content.service'
import { PrepareProjectSkillContextCommand } from '../prepare-project-skill-context.command'

@CommandHandler(PrepareProjectSkillContextCommand)
export class PrepareProjectSkillContextHandler implements ICommandHandler<PrepareProjectSkillContextCommand> {
    constructor(private readonly content: XpertProjectContentService) {}
    execute(command: PrepareProjectSkillContextCommand) {
        return this.content.prepareTaskSkills(command.projectId, command.invocationId)
    }
}
