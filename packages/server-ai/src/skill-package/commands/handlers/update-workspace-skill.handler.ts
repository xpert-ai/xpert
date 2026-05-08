import {
	SkillCreatorToolResult,
	UpdateWorkspaceSkillCommand
} from '../../authoring/skill-creator-cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { buildSkillCreatorMetadata, resolveWorkspaceAuthoredSkill } from '../../authoring/skill-authoring'
import { SkillPackageService } from '../../skill-package.service'

@CommandHandler(UpdateWorkspaceSkillCommand)
export class UpdateWorkspaceSkillHandler implements ICommandHandler<UpdateWorkspaceSkillCommand> {
	constructor(private readonly skillPackageService: SkillPackageService) {}

	async execute(command: UpdateWorkspaceSkillCommand): Promise<SkillCreatorToolResult> {
		try {
			const resolved = await resolveWorkspaceAuthoredSkill(
				this.skillPackageService,
				command.workspaceId,
				command.payload.skillRef
			)
			if (resolved.status !== 'found' || !resolved.skillPackage?.id) {
				return resolved
			}

			const result = await this.skillPackageService.saveWorkspaceSkillMarkdown(
				command.workspaceId,
				resolved.skillPackage.id,
				command.payload.skillMarkdown,
				{ strictFrontmatter: true }
			)
			const skill = buildSkillCreatorMetadata(result.skillPackage)

			return {
				status: 'applied',
				summary: `Updated SKILL.md for workspace skill "${skill.displayName ?? skill.name ?? result.skillPackage.id}".`,
				skill,
				skillMarkdown: result.file.contents ?? '',
				candidates: resolved.candidates
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
