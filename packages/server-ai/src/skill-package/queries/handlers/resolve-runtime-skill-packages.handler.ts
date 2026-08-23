import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { In } from 'typeorm'
import { SkillPackageService } from '../../skill-package.service'
import { ResolveRuntimeSkillPackagesQuery, RuntimeSkillPackageIdentity } from '../resolve-runtime-skill-packages.query'

/** Applies the normal workspace permission boundary before returning skill IDs. */
@QueryHandler(ResolveRuntimeSkillPackagesQuery)
export class ResolveRuntimeSkillPackagesHandler implements IQueryHandler<
    ResolveRuntimeSkillPackagesQuery,
    RuntimeSkillPackageIdentity[]
> {
    constructor(private readonly skillPackageService: SkillPackageService) {}

    async execute(query: ResolveRuntimeSkillPackagesQuery): Promise<RuntimeSkillPackageIdentity[]> {
        const skillIds = Array.from(new Set(query.skillIds.map((id) => id.trim()).filter(Boolean))).slice(0, 100)
        if (!skillIds.length) {
            return []
        }

        const result = await this.skillPackageService.getAllByWorkspaceForRuntime(
            query.workspaceId,
            {
                where: { id: In(skillIds) },
                skip: 0,
                take: skillIds.length,
                order: {},
                withDeleted: false
            },
            false,
            query.currentUser
        )

        return (result.items ?? []).map(({ id, sharedSkillId }) => ({ id, sharedSkillId }))
    }
}
