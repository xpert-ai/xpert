import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ForbiddenException } from '@nestjs/common'
import { canManageGlobalPlugins } from '@xpert-ai/server-core'
import { t } from 'i18next'
import { PreparePluginTestAccessCommand } from '../prepare-plugin-test-access.command'
import { PluginMcpServerService } from '../../mcp/plugin-mcp-server.service'

@CommandHandler(PreparePluginTestAccessCommand)
export class PreparePluginTestAccessHandler implements ICommandHandler<PreparePluginTestAccessCommand> {
  constructor(private readonly servers: PluginMcpServerService) {}
  execute(command: PreparePluginTestAccessCommand) {
    if (!canManageGlobalPlugins()) throw new ForbiddenException(t('server-ai:Error.PluginDeploymentPublisherDenied'))
    return this.servers.prepareTestAccess(command.pluginName, command.componentKey, command.operationId, command.expected)
  }
}
