import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { getEnvironmentVariable } from '@langchain/core/utils/env'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { ModelProvider } from '../../../ai-provider'
import { TextToSpeechModel } from '../../../tts'
import { TChatModelOptions } from '../../../types/types'
import { createSSEGenerator } from '../../../../shared/utils'

@Injectable()
export class TongyiTTSModel extends TextToSpeechModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TTS)
	}
	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		const parameters = copilotModel.options || options?.modelProperties

		return new TTSChatModel({
			apiKey: copilotModel.copilot.modelProvider.credentials.dashscope_api_key,
			model: copilotModel.model,
			voice: parameters?.voice
		})
	}
}

export interface ChatTongyiTTSInput extends BaseChatModelParams {
	/**
	 */
	apiKey?: string
	model: string
	voice: string
}

export class TTSChatModel extends BaseChatModel {
	_llmType(): string {
		return 'tongyi-tts'
	}

	protected apiKey: string

	constructor(private fields?: Partial<ChatTongyiTTSInput>) {
		const apiKey = fields?.apiKey || getEnvironmentVariable('DASHSCOPE_API_KEY')
		if (!apiKey) {
			throw new Error(
				`Tongyi API key not found. Please set the DASHSCOPE_API_KEY environment variable or pass the key into "apiKey" field.`
			)
		}
		super({
			...fields
		})

		this.apiKey = apiKey
	}

	async _generate(
		messages: BaseMessage[],
		options: this['ParsedCallOptions'],
		runManager?: CallbackManagerForLLMRun
	): Promise<ChatResult> {
		console.log(messages, options)
		throw new Error('Method not implemented.')
	}

	 async *_streamResponseChunks(
		messages: BaseMessage[],
		options: this["ParsedCallOptions"],
		runManager?: CallbackManagerForLLMRun
	): AsyncGenerator<ChatGenerationChunk> {
		const {signal} = options
		const apiKey = this.apiKey
		const model = this.fields?.model || 'tongyi-tts'
		const voice = this.fields?.voice

		const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

		const headers = {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'X-DashScope-SSE': 'enable'
		}

		const text = messages[0].content as string
		const data = {
			model,
			input: {
				text: text,
				voice
			}
		}

		const generator = createSSEGenerator({
			url,
			fetchOptionsBuilder: () => ({
				method: 'POST',
				headers,
				body: JSON.stringify(data)
			}),
			completionCondition: (data) => data.includes('stop'),
			errorCondition: (data) => false ,// data.startsWith('[ERROR]'),
			parseData: (data) => data, //JSON.parse(data.trim()), // optional
			signal
		})

		for await (const event of generator) {
			if (event.type === 'progress') {
				// console.log('🚧 Progress .')
				yield _convertTTSDeltaToBaseMessageChunk(event.output)
			} else if (event.type === 'complete') {
				// console.log('✅ Complete:', event.status, event.result || event.error)
				yield _convertTTSDeltaToBaseMessageChunk(event.result)
				break
			} else if (event.type === 'error') {
				console.error('❌ Error:', event.error)
				break
			}
		}
	}
}

function _convertTTSDeltaToBaseMessageChunk(
  chunk: string
) {
  const message = JSON.parse(chunk);
  return new ChatGenerationChunk({
	text: '',
	message: new AIMessageChunk({
		id: message.output.id,
		content: [
			{
				...message.output.audio,
				type: 'audio',
			}
		],
		usage_metadata: message.usage,
    }),
    // generationInfo,
  });
}

async function* generateSpeech(params: Partial<ChatTongyiTTSInput>, text: string, stream = false) {
	const {apiKey, model, voice} = params
	const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json'
	}
	if (stream) {
		headers['X-DashScope-SSE'] = 'enable'
	}

	const data = {
		model,
		input: {
			text: text,
			voice
		}
	}

	const abortController = new AbortController()
	if (stream) {
		const generator = createSSEGenerator({
			url,
			fetchOptionsBuilder: () => ({
				method: 'POST',
				headers,
				body: JSON.stringify(data)
			}),
			completionCondition: (data) => data.includes('[DONE]'),
			errorCondition: (data) => data.startsWith('[ERROR]'),
			parseData: (data) => data.trim(), // optional
			signal: abortController.signal // optional
		})

		for await (const event of generator) {
			if (event.type === 'progress') {
				console.log('🚧 Progress .')
				yield event.output
			} else if (event.type === 'complete') {
				console.log('✅ Complete:', event.status, event.result || event.error)
				yield event.result
				break
			} else if (event.type === 'error') {
				console.error('❌ Error:', event.error)
				break
			}
		}
	} else {
		try {
			const response = await axios.post(url, data, { headers })
			console.log('Response:', response.data)
			yield  response.data
		} catch (error) {
			console.error('Error calling DashScope API:', error.response?.data || error.message)
		}
	}
}
