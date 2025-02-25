import { AiModelTypeEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { LargeLanguageModel } from '../../../llm'

@Injectable()
export class SparkLargeLanguageModel extends LargeLanguageModel {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}
}
