import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatResult } from '@langchain/core/outputs'
import { getEnvironmentVariable } from '@langchain/core/utils/env'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { ModelProvider } from '../../../ai-provider'
import { TChatModelOptions } from '../../../types/types'
import { OAICompatSpeech2TextModel } from '../../openai_api_compatible'

@Injectable()
export class TongyiSpeech2TextModel extends OAICompatSpeech2TextModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
	}

	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		return new Speech2TextChatModel({
			apiKey: copilotModel.copilot.modelProvider.credentials.dashscope_api_key,
			model: copilotModel.model
		})
	}
}

export interface ChatTongyiSpeech2TextInput extends BaseChatModelParams {
	/**
	 */
	apiKey?: string
	model: string
}

export class Speech2TextChatModel extends BaseChatModel {
	_llmType(): string {
		return 'tongyi-speech2text'
	}

	protected apiKey: string

	constructor(private fields?: Partial<ChatTongyiSpeech2TextInput>) {
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
		const humanMessage = messages[messages.length - 1]

		const fileUrls = (<{ url: string }[]>humanMessage.content).map((_) => _.url)
		const languageHints = ['zh', 'en']

		const taskId = await submitTask(this.apiKey, fileUrls, languageHints)

		if (taskId) {
			const result = await waitForComplete(taskId, this.apiKey)
			const content = await processTranscriptions(result)
			return {
				generations: content.map((content) => ({
					text: content,
					message: new AIMessage({
						content
					})
				}))
			}
		}
	}
}

/**
 * Submit transcription task
 */
async function submitTask(apiKey: string, fileUrls: string[], languageHints): Promise<string | null> {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		'X-DashScope-Async': 'enable'
	}

	const data = {
		model: 'paraformer-v2',
		input: {
			file_urls: fileUrls
		},
		parameters: {
			channel_id: [0],
			language_hints: languageHints,
			vocabulary_id: 'vocab-Xxxx'
		}
	}

	const serviceUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'

	const response = await axios.post(serviceUrl, data, { headers })
	if (response.status === 200) {
		return response.data.output.task_id
	} else {
		console.error('Submit task failed!', response.data)
		throw new Error(`Failed to submit task: ${response.data.message || 'Unknown error'}`)
	}
}

/**
 * Poll the task status until it succeeds
 */
async function waitForComplete(taskId: string, apiKey: string): Promise<any> {
	const headers = {
		Authorization: `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
		'X-DashScope-Async': 'enable'
	}

	const serviceUrl = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`

	return new Promise((resolve, reject) => {
		const poll = async () => {
			try {
				const response = await axios.post(serviceUrl, {}, { headers })
				const status = response.data.output.task_status

				if (status === 'SUCCEEDED') {
					resolve(response.data.output.results)
				} else if (status === 'RUNNING' || status === 'PENDING') {
					setTimeout(poll, 300)
				} else {
					console.error('Task failed:', response.data)
					reject(response.data.output?.message || 'Task failed with unknown error')
				}
			} catch (error) {
				console.error('Query failed:', error)
				reject(error)
			}
		}

		poll()
	})
}

interface Word {
	begin_time: number
	end_time: number
	text: string
	punctuation: string
}

interface Sentence {
	begin_time: number
	end_time: number
	text: string
	sentence_id: number
	words: Word[]
}

interface Transcript {
	channel_id: number
	content_duration_in_milliseconds: number
	text: string
	sentences: Sentence[]
}

interface TranscriptionResult {
	file_url: string
	properties: {
		audio_format: string
		channels: number[]
		original_sampling_rate: number
		original_duration_in_milliseconds: number
	}
	transcripts: Transcript[]
}

async function downloadAndExtractText(url: string): Promise<string> {
	try {
		const response = await axios.get<TranscriptionResult>(url, {
			responseType: 'json'
		})

		const data = response.data
		const allSentences: string[] = []

		for (const transcript of data.transcripts) {
			for (const sentence of transcript.sentences) {
				allSentences.push(sentence.text)
			}
		}

		const finalText = allSentences.join(' ')
		return finalText
	} catch (error) {
		throw new Error(`Failed to download transcription file: ${getErrorMessage(error)}`)
	}
}

// 示例用法：处理 transcription 结果数组
async function processTranscriptions(results: { transcription_url: string }[]) {
	const texts = [] as string[]
	for await (const result of results) {
		const text = await downloadAndExtractText(result.transcription_url)
		texts.push(text)
	}

	return texts
}
