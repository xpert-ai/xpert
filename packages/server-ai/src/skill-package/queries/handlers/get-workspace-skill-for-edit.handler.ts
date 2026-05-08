import {
	GetWorkspaceSkillForEditQuery,
	SkillCreatorToolResult
} from '../../authoring/skill-creator-cqrs'
import { getErrorMessage } from '@xpert-ai/server-common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { resolveWorkspaceAuthoredSkill } from '../../authoring/skill-authoring'
import { SkillPackageService } from '../../skill-package.service'

@QueryHandler(GetWorkspaceSkillForEditQuery)
export class GetWorkspaceSkillForEditHandler implements IQueryHandler<GetWorkspaceSkillForEditQuery> {
	constructor(private readonly skillPackageService: SkillPackageService) {}

	async execute(query: GetWorkspaceSkillForEditQuery): Promise<SkillCreatorToolResult> {
		try {
			const resolved = await resolveWorkspaceAuthoredSkill(
				this.skillPackageService,
				query.workspaceId,
				query.payload.skillRef
			)
			if (resolved.status !== 'found' || !resolved.skillPackage?.id) {
				return resolved
			}

			const file = await this.skillPackageService.readSkillPackageFile(
				query.workspaceId,
				resolved.skillPackage.id,
				'SKILL.md'
			)

			return {
				status: 'found',
				summary: `Loaded SKILL.md for "${resolved.skill?.displayName ?? resolved.skill?.name ?? resolved.skillPackage.id}".`,
				skill: resolved.skill,
				skillMarkdown: file.contents ?? '',
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
