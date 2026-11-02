import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { applicationResourcePolicy, AssertAppPlatformUploadCommand } from '../../shared/app-platform-resource-policy'
import { platformFailure } from './platform-error'

@CommandHandler(AssertAppPlatformUploadCommand)
export class AssertAppPlatformUploadHandler implements ICommandHandler<AssertAppPlatformUploadCommand> {
    constructor(private readonly database: DataSource) {}
    async execute(command: AssertAppPlatformUploadCommand) {
        const policy = await applicationResourcePolicy(
            this.database.manager,
            RequestContext.currentTenantId(),
            RequestContext.currentUserId()
        )
        if (!policy) return
        if (!Number.isSafeInteger(command.bytes) || command.bytes < 0 || command.bytes > policy.maxUploadBytes)
            throw platformFailure('application_upload_limit', 413)
    }
}
