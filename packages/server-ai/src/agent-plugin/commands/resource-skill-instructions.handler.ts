import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ResourceSkillInstructionsQuery } from './resource-skill-instructions.query'
import { RuntimeResourceCommandsService } from './runtime-resource-commands.service'

@QueryHandler(ResourceSkillInstructionsQuery)
export class ResourceSkillInstructionsHandler implements IQueryHandler<ResourceSkillInstructionsQuery> {
    constructor(private readonly service: RuntimeResourceCommandsService) {}
    execute(query: ResourceSkillInstructionsQuery) {
        return this.service.instructions(query.assistantId, query.selection, query.references, query.projectId)
    }
}
