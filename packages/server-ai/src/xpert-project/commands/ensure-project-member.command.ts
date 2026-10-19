import { Command } from '@nestjs/cqrs'
import type { EntityManager } from 'typeorm'

/** Ensure human membership in the caller's transaction; Project management authorization remains required. */
export class EnsureXpertProjectMemberCommand extends Command<void> {
    constructor(
        public readonly projectId: string,
        public readonly userId: string,
        public readonly manager: EntityManager
    ) {
        super()
    }
}
