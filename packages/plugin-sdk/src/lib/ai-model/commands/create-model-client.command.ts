import { Embeddings } from '@langchain/core/embeddings'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ICopilotModel, ILLMUsage } from '@metad/contracts'
import { Command } from '@nestjs/cqrs'
import { IRerank } from '../types'

const COMMAND_METADATA = '__command__'

/**
 * Get a Chat Model of copilot model and check it's token limitation, record the token usage
 */
export class CreateModelClientCommand<T = BaseLanguageModel | BaseChatModel | Embeddings | IRerank> extends Command<T> {
  static readonly type = '[AI Model] Create Model Client'

  constructor(
    public readonly copilotModel: ICopilotModel,
    public readonly options: {
      abortController?: AbortController
      usageCallback: (tokens: ILLMUsage) => void
    }
  ) {
    super()
  }
}

Reflect.defineMetadata(COMMAND_METADATA, { id: CreateModelClientCommand.type }, CreateModelClientCommand)
