import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextToSpeechModel } from '../../../tts'
import { TChatModelOptions } from '../../../types/types'

@Injectable()
export class TongyiTTSModel extends TextToSpeechModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TTS)
	}
	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}

	getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
		throw new Error(`Unsupport chat model!`)
	}
}
