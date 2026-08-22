import type { IUser } from '@xpert-ai/contracts'
import { Query } from '@nestjs/cqrs'

/** Minimal skill identity exposed to runtime callers across the CQRS boundary. */
export type RuntimeSkillPackageIdentity = {
    id: string
    sharedSkillId?: string | null
}

/**
 * Resolves workspace-visible skill packages for a trusted list of configured IDs.
 * Keeping this query free of SkillPackageModule imports avoids a bootstrap cycle
 * with the global Agent middleware runtime.
 */
export class ResolveRuntimeSkillPackagesQuery extends Query<RuntimeSkillPackageIdentity[]> {
    constructor(
        public readonly workspaceId: string,
        public readonly skillIds: string[],
        public readonly currentUser: IUser
    ) {
        super()
    }
}
