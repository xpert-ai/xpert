import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { Speech2TextChatModel, SpeechToTextModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy'

@Injectable()
export class OpenAICompatibleSpeech2TextModel extends SpeechToTextModel {
  constructor(modelProvider: OpenAICompatibleProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
  }

  validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    return new Speech2TextChatModel({
      apiKey: '',
      model: copilotModel.model
    })
  }
}
