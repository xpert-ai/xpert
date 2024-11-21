import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { AIModel } from '../../ai-model'
import { OpenAICredentials, toCredentialKwargs } from './types'

export abstract class CommonOpenAI extends AIModel {
	protected toCredentialKwargs(credentials: OpenAICredentials): OpenAIBaseInput & { configuration: ClientOptions } {
		return toCredentialKwargs(credentials)
	}
}
