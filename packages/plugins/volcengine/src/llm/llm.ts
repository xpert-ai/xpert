import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { VolcengineProviderStrategy } from '../provider.strategy'
import { toCredentialKwargs, VolcengineModelCredentials } from '../types'

@Injectable()
export class VolcengineLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(VolcengineLargeLanguageModel.name)

  constructor(modelProvider: VolcengineProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: VolcengineModelCredentials): Promise<void> {
    try {
      const chatModel = new ChatOpenAI({
        ...toCredentialKwargs(credentials),
        model,
        temperature: 0,
        maxTokens: 5
      })
      await chatModel.invoke([
        {
          role: 'human',
          content: `Hi`
        }
      ])
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens, modelProperties } = options ?? {}
    const { copilot } = copilotModel
    const params = toCredentialKwargs(modelProperties as VolcengineModelCredentials)

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        model,
        // include token usage in the stream. this will include an additional chunk at the end of the stream with the token usage.
        streamUsage: true
      },
      isNil
    )
    return new ChatOAICompatReasoningModel({
      ...fields,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, model, modelProperties, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ]
    })
  }
}
