import { Command } from '@nestjs/cqrs'

/** Resolve a group's current Project for a trusted human; callers retain resource and source authorization. */
export class ResolveGroupProjectAccessCommand extends Command<{ groupId: string; projectId: string | null }> {
    constructor(
        public readonly actor: { tenantId: string; organizationId: string; userId: string },
        public readonly groupId: string,
        /** An offer is not an access grant. Only a live group owner may accept it or remove it. */
        public readonly operation: 'offer' | 'read' | 'manage' | 'remove'
    ) {
        super()
    }
}
