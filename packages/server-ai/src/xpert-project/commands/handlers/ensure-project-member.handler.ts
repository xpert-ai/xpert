import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { XpertProjectMembershipService } from '../../services/project-membership.service'
import { EnsureXpertProjectMemberCommand } from '../ensure-project-member.command'

@CommandHandler(EnsureXpertProjectMemberCommand)
export class EnsureXpertProjectMemberHandler implements ICommandHandler<EnsureXpertProjectMemberCommand> {
    constructor(private readonly memberships: XpertProjectMembershipService) {}

    async execute(command: EnsureXpertProjectMemberCommand): Promise<void> {
        await this.memberships.ensureMember(command.projectId, command.userId, command.manager)
    }
}
