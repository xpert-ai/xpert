import {
	DeleteWorkspaceSkillCommand,
	SkillCreatorToolResult
} from '../../authoring/skill-creator-cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { resolveWorkspaceAuthoredSkill } from '../../authoring/skill-authoring'
import { SkillPackageService } from '../../skill-package.service'

@CommandHandler(DeleteWorkspaceSkillCommand)
export class DeleteWorkspaceSkillHandler implements ICommandHandler<DeleteWorkspaceSkillCommand> {
	constructor(private readonly skillPackageService: SkillPackageService) {}

	async execute(command: DeleteWorkspaceSkillCommand): Promise<SkillCreatorToolResult> {
		try {
			const resolved = await resolveWorkspaceAuthoredSkill(
				this.skillPackageService,
				command.workspaceId,
				command.payload.skillRef
			)
			if (resolved.status !== 'found' || !resolved.skillPackage?.id) {
				return resolved
			}

			await this.skillPackageService.uninstallSkillPackageInWorkspace(command.workspaceId, resolved.skillPackage.id)

			return {
				status: 'applied',
				summary: `Deleted workspace skill "${resolved.skill?.displayName ?? resolved.skill?.name ?? resolved.skillPackage.id}".`,
				skill: resolved.skill,
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
