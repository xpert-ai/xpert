import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { GrantAssistantAccessCommand } from './grant-assistant-access.command'
import { Module } from '@nestjs/common'
import { CqrsModule, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserGroupManagedByEnum } from '@xpert-ai/contracts'
import { XpertWorkspaceModule } from '../../xpert-workspace/workspace.module'
import { Xpert } from '../xpert.entity'
import { AssistantSharingService } from './sharing.service'

@CommandHandler(GrantAssistantAccessCommand)
export class GrantAssistantAccessHandler implements ICommandHandler<GrantAssistantAccessCommand> {
    constructor(private readonly sharing: AssistantSharingService) {}
    execute(command: GrantAssistantAccessCommand) {
        return this.sharing.grantUsers(command.xpertId, [command.userId], UserGroupManagedByEnum.XPERT_MARKETPLACE)
    }
}
@Module({
    imports: [TypeOrmModule.forFeature([Xpert]), XpertWorkspaceModule, CqrsModule],
    providers: [AssistantSharingService, PublishedXpertAccessService, GrantAssistantAccessHandler],
    exports: [AssistantSharingService, PublishedXpertAccessService]
})
export class AssistantSharingModule {}
