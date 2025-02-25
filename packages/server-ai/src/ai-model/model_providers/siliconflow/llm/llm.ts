import { Injectable } from '@nestjs/common'
import { OAIAPICompatLargeLanguageModel } from '../../openai_api_compatible/llm/llm'

@Injectable()
export class SiliconflowLargeLanguageModel extends OAIAPICompatLargeLanguageModel {
	validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
		throw new Error('Method not implemented.')
	}
}
