import { ICopilotModel } from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import {
  AgentMiddlewareCreateModelClientOptions,
  AgentMiddlewareModelClient,
} from '../../agent/middleware/runtime'

const COMMAND_METADATA = '__command__'

/**
 * Get a Chat Model of copilot model and check it's token limitation, record the token usage
 *
 * @deprecated Prefer `IAgentMiddlewareContext.runtime.createModelClient(...)` in middleware and plugin code.
 */
export class CreateModelClientCommand<T = AgentMiddlewareModelClient> extends Command<T> {
  static readonly type = '[AI Model] Create Model Client'

  constructor(
    public readonly copilotModel: ICopilotModel,
    public readonly options: AgentMiddlewareCreateModelClientOptions
  ) {
    super()
  }
}

Reflect.defineMetadata(COMMAND_METADATA, { id: CreateModelClientCommand.type }, CreateModelClientCommand)
