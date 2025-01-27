// 同步与：`@metad/server-ai`/copilot/llm.ts
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI, ClientOptions } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { AI_PROVIDERS, AiProtocol, AiProvider, ICopilot, sumTokenUsage } from '@metad/copilot'
import { NgmChatOllama } from './chat-ollama'
import { TCopilotCredentials } from '../../types'


export function createLLM<T = BaseChatModel>(
  copilot: ICopilot,
  credentials: TCopilotCredentials,
  clientOptions: any,
  tokenRecord: (input: { copilot: ICopilot; tokenUsed: number }) => void
): T {
  if (!copilot) {
    return null
  }

  const providerName = copilot.modelProvider.providerName
  const model = copilot.copilotModel.model
  const modelOptions = copilot.copilotModel.options

  if (AI_PROVIDERS[providerName]?.protocol === AiProtocol.OpenAI) {
    return new ChatOpenAI({
      apiKey: credentials.apiKey,
      model,
      temperature: modelOptions?.['temperature'] ?? 0,
      maxRetries: modelOptions?.['maxRetries'] ?? 2,
      streaming: modelOptions?.['streaming'] ?? true,
      ...(clientOptions ?? {}),
      configuration: {
        baseURL: credentials.apiHost ? (credentials.apiHost + `/${copilot.id}`) : AI_PROVIDERS[providerName]?.apiHost || null,
        ...(clientOptions ?? {})
      },
      callbacks: [
        {
          handleLLMEnd(output) {
            tokenRecord({
							copilot,
							tokenUsed: output.llmOutput?.['totalTokens'] ?? sumTokenUsage(output)
						})
          }
        }
      ]
    }) as T
  }
  switch (providerName) {
    case AiProvider.Ollama:
      return new NgmChatOllama({
        baseUrl: credentials.apiHost ? (credentials.apiHost + `/${copilot.id}`) : null,
        model,
        temperature: modelOptions?.['temperature'] ?? 0,
        maxRetries: modelOptions?.['maxRetries'] ?? 2,
        streaming: modelOptions?.['streaming'] ?? true,
        headers: {
          ...(clientOptions?.defaultHeaders ?? {})
        },
        callbacks: [
          {
            handleLLMEnd(output) {
              tokenRecord({ copilot, tokenUsed: sumTokenUsage(output) })
            }
          }
        ]
      }) as T
    case AiProvider.Anthropic: {
      return new ChatAnthropic({
        anthropicApiUrl: credentials.apiHost ? (credentials.apiHost + `/${copilot.id}`) : null,
        apiKey: credentials.apiKey,
        model,
        temperature: modelOptions?.['temperature'] ?? 0,
        maxTokens: undefined,
        maxRetries: modelOptions?.['maxRetries'] ?? 2,
        streaming: modelOptions?.['streaming'] ?? true,
        callbacks: [
          {
            handleLLMEnd(output) {
              tokenRecord({
                copilot,
                tokenUsed: output.llmOutput?.['totalTokens'] ?? sumTokenUsage(output)
              })
            }
          }
        ]
      }) as T
    }
    // @todo
    // case AiProvider.BaiduQianfan: {
		// 	return new ChatBaiduQianfan({
		// 		qianfanAccessKey: copilot.apiKey,
		// 		qianfanSecretKey: copilot.apiKey,
		// 		model: copilot.defaultModel
		// 	}) as T
		// }
    default:
      return null
  }
}
