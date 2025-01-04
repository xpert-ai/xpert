// import { ChatAnthropic } from '@langchain/anthropic'
// import { BaiduQianfanEmbeddings, ChatBaiduQianfan } from '@langchain/baidu-qianfan'
// import { ChatCohere, CohereEmbeddings } from '@langchain/cohere'
// import { AlibabaTongyiEmbeddings } from '@langchain/community/embeddings/alibaba_tongyi'
// import { TogetherAIEmbeddings } from '@langchain/community/embeddings/togetherai'
// import { ZhipuAIEmbeddings } from '@langchain/community/embeddings/zhipuai'
// import { Embeddings } from '@langchain/core/embeddings'
// import { BaseChatModel } from '@langchain/core/language_models/chat_models'
// import { MistralAIEmbeddings } from '@langchain/mistralai'
// import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
// import { ChatOpenAI, ClientOptions, OpenAIEmbeddings } from '@langchain/openai'
// import { ICopilot, OllamaEmbeddingsProviders, OpenAIEmbeddingsProviders } from '@metad/contracts'
// import { AI_PROVIDERS, AiProtocol, AiProvider, sumTokenUsage } from '@metad/copilot'

// /**
//  * @deprecated use Command `AIModelGetOneQuery`
//  */
// export function createLLM<T = ChatOpenAI | BaseChatModel>(
// 	copilot: ICopilot,
// 	clientOptions: ClientOptions,
// 	tokenRecord: (input: { copilot: ICopilot; tokenUsed: number }) => void
// ): T {
// 	if (AI_PROVIDERS[copilot?.provider]?.protocol === AiProtocol.OpenAI) {
// 		return new ChatOpenAI({
// 			apiKey: copilot.apiKey,
// 			configuration: {
// 				baseURL: copilot.apiHost || AI_PROVIDERS[copilot.provider]?.apiHost || null,
// 				...(clientOptions ?? {})
// 			},
// 			model: copilot.defaultModel,
// 			temperature: 0,
// 			callbacks: [
// 				{
// 					handleLLMEnd(output) {
// 						tokenRecord({
// 							copilot,
// 							tokenUsed: output.llmOutput?.totalTokens ?? sumTokenUsage(output)
// 						})
// 					}
// 				}
// 			]
// 		}) as T
// 	}
// 	switch (copilot?.provider) {
// 		case AiProvider.Ollama:
// 			return new ChatOllama({
// 				baseUrl: copilot.apiHost || null,
// 				model: copilot.defaultModel,
// 				callbacks: [
// 					{
// 						handleLLMEnd(output) {
// 							tokenRecord({ copilot, tokenUsed: sumTokenUsage(output) })
// 						}
// 					}
// 				]
// 			}) as T
// 		case AiProvider.Anthropic: {
// 			return new ChatAnthropic({
// 				anthropicApiUrl: copilot.apiHost || null,
// 				apiKey: copilot.apiKey,
// 				model: copilot.defaultModel,
// 				temperature: 0,
// 				maxTokens: undefined,
// 				maxRetries: 2,
// 				callbacks: [
// 					{
// 						handleLLMEnd(output) {
// 							tokenRecord({
// 								copilot,
// 								tokenUsed: output.llmOutput?.totalTokens ?? sumTokenUsage(output)
// 							})
// 						}
// 					}
// 				]
// 			}) as T
// 		}
// 		case AiProvider.BaiduQianfan: {
// 			const [accessKey, secretKey] = copilot.apiKey?.split('/') ?? []
// 			return new ChatBaiduQianfan({
// 				qianfanAccessKey: accessKey,
// 				qianfanSecretKey: secretKey,
// 				model: copilot.defaultModel
// 			}) as T
// 		}
// 		case AiProvider.Cohere: {
// 			return new ChatCohere({
// 				apiKey: copilot.apiKey,
// 				model: copilot.defaultModel,
// 				temperature: 0,
// 				maxRetries: copilot.options?.maxRetries ?? 2
// 				// other params...
// 			}) as T
// 		}
// 		default:
// 			return null
// 	}
// }

// export function createEmbeddings(
// 	copilot: ICopilot,
// 	options?: { model: string; batchSize?: number },
// 	tokenRecord?: (input: { copilot: ICopilot; tokenUsed: number }) => void
// ): Embeddings {
// 	const { model, batchSize } = options ?? {}
// 	if (OpenAIEmbeddingsProviders.includes(copilot.provider)) {
// 		return new OpenAIEmbeddings({
// 			verbose: true,
// 			apiKey: copilot.apiKey,
// 			model: model ?? copilot.defaultModel,
// 			configuration: {
// 				baseURL: copilot.apiHost
// 			}
// 		})
// 	} else if (OllamaEmbeddingsProviders.includes(copilot.provider)) {
// 		return new OllamaEmbeddings({
// 			baseUrl: copilot.apiHost,
// 			model: model ?? copilot.defaultModel
// 		})
// 	} else {
// 		switch (copilot.provider) {
// 			case AiProvider.AlibabaTongyi:
// 				return new AlibabaTongyiEmbeddings({
// 					apiKey: copilot.apiKey,
// 					batchSize: batchSize || 25
// 				})
// 			case AiProvider.Zhipu:
// 				return new ZhipuAIEmbeddings({
// 					apiKey: copilot.apiKey
// 				})
// 			case AiProvider.BaiduQianfan: {
// 				const [accessKey, secretKey] = copilot.apiKey?.split('/') ?? []
// 				return new BaiduQianfanEmbeddings({
// 					qianfanAccessKey: accessKey,
// 					qianfanSecretKey: secretKey
// 				})
// 			}
// 			case AiProvider.Together: {
// 				return new TogetherAIEmbeddings({
// 					model: model || copilot.defaultModel || 'togethercomputer/m2-bert-80M-8k-retrieval' // Default value
// 				})
// 			}
// 			case AiProvider.Mistral: {
// 				return new MistralAIEmbeddings({
// 					apiKey: copilot.apiKey,
// 					model: model || copilot.defaultModel || 'mistral-embed' // Default value
// 				})
// 			}
// 			case AiProvider.Cohere: {
// 				return new CohereEmbeddings({
// 					apiKey: copilot.apiKey,
// 					model: model || copilot.defaultModel || 'embed-english-v3.0'
// 				})
// 			}
// 			default:
// 				throw new Error(`Unimplemented copilot provider '${copilot.provider}' for embeddings`)
// 		}
// 	}
// }
