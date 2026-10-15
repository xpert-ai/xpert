import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ImportDefaultAgentPluginsCommand } from '@xpert-ai/plugin-sdk'
import { DefaultAgentPluginsService } from './default-agent-plugins.service'

@CommandHandler(ImportDefaultAgentPluginsCommand)
export class ImportDefaultAgentPluginsHandler implements ICommandHandler<ImportDefaultAgentPluginsCommand> {
    constructor(private readonly defaults: DefaultAgentPluginsService) {}

    execute() {
        return this.defaults.importAndWait()
    }
}
