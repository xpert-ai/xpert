import { Command } from '@nestjs/cqrs'
import type { DefaultAgentPluginsImportResult } from '@xpert-ai/contracts'

/** Import official resource packages for the authenticated organization administrator. Does not authorize workspaces. */
export class ImportDefaultAgentPluginsCommand extends Command<DefaultAgentPluginsImportResult> {
  static readonly type = '[Agent Plugins] Import defaults'
}

Reflect.defineMetadata('__command__', { id: ImportDefaultAgentPluginsCommand.type }, ImportDefaultAgentPluginsCommand)
