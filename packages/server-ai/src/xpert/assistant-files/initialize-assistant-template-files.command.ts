import { Command, CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { VOLUME_CLIENT, VolumeClient } from '../../shared/volume'
import { initializeTemplateFiles } from '../../shared/volume/initialize-template-files'
import { AssistantFileEntry, ResolveAssistantFileAccessCommand } from './resolve-assistant-file-access.command'

/** Initialize the authorized Assistant volume from its installed snapshot; never reads a mutable marketplace source. */
export class InitializeAssistantTemplateFilesCommand extends Command<void> {
    constructor(
        readonly assistantId: string,
        readonly entry: AssistantFileEntry
    ) {
        super()
    }
}

@CommandHandler(InitializeAssistantTemplateFilesCommand)
export class InitializeAssistantTemplateFilesHandler implements ICommandHandler<InitializeAssistantTemplateFilesCommand> {
    constructor(
        private readonly commands: CommandBus,
        @Inject(VOLUME_CLIENT) private readonly volumes: VolumeClient
    ) {}
    async execute(command: InitializeAssistantTemplateFilesCommand) {
        const access = await this.commands.execute(
            new ResolveAssistantFileAccessCommand(command.assistantId, 'write', command.entry)
        )
        if (access.initialFiles) await initializeTemplateFiles(this.volumes.resolve(access.scope), access.initialFiles)
    }
}
