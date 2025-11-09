import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatResult } from '@langchain/core/outputs'
import { getEnvironmentVariable } from '@langchain/core/utils/env'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { SpeechToTextModel, TChatModelOptions } from '../types'
import { ModelProvider } from '../abstract-provider'


export interface ChatSpeech2TextInput extends BaseChatModelParams {
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

	constructor(private fields?: Partial<ChatSpeech2TextInput>) {
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


		return {
			generations: [].map((content) => ({
				text: content,
				message: new AIMessage({
					content
				})
			}))
		}
	}
}
