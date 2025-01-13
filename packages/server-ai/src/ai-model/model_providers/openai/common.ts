import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { OpenAICredentials, toCredentialKwargs } from './types'
import { LargeLanguageModel } from '../../llm'

export abstract class CommonOpenAI extends LargeLanguageModel {
	protected toCredentialKwargs(credentials: OpenAICredentials): OpenAIBaseInput & { configuration: ClientOptions } {
		return toCredentialKwargs(credentials)
	}
}
