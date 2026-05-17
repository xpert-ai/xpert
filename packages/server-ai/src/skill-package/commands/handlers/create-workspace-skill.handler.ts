import { CreateWorkspaceSkillCommand, SkillCreatorToolResult } from '../../authoring/skill-creator-cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { buildSkillCreatorMetadata } from '../../authoring/skill-authoring'
import { SkillPackageService } from '../../skill-package.service'

@CommandHandler(CreateWorkspaceSkillCommand)
export class CreateWorkspaceSkillHandler implements ICommandHandler<CreateWorkspaceSkillCommand> {
    constructor(private readonly skillPackageService: SkillPackageService) {}

    async execute(command: CreateWorkspaceSkillCommand): Promise<SkillCreatorToolResult> {
        try {
            const result = await this.skillPackageService.createWorkspaceSkillPackage(command.workspaceId, {
                userIntent: command.payload.userIntent,
                skillName: command.payload.skillName,
                skillMarkdown: command.payload.skillMarkdown,
                files: command.payload.files,
                strictFrontmatter: true
            })
            const skill = buildSkillCreatorMetadata(result.skillPackage)

            return {
                status: 'applied',
                summary: `Created workspace skill "${skill.displayName ?? skill.name ?? result.skillPackage.id}".`,
                skill,
                packagePath: result.packagePath,
                files: result.files
            }
        } catch (error) {
            return {
                status: 'rejected',
                summary: getErrorMessage(error),
                candidates: []
            }
        }
    }
}
