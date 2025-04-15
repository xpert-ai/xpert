import { OllamaCamelCaseOptions, OllamaEmbeddings } from '@langchain/ollama'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { CredentialsValidateFailedError } from '../../errors'
import { OllamaCredentials, OllamaModelCredentials } from '../types'
import { TChatModelOptions } from '../../../types/types'

@Injectable()
export class OllamaTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OllamaEmbeddings {
		const ollamaCredentials =  copilotModel.copilot.modelProvider?.credentials as OllamaCredentials
		const modelProperties = options.modelProperties as OllamaModelCredentials
		const requestOptions = {} as OllamaCamelCaseOptions
		if (modelProperties?.context_size) {
			requestOptions.numCtx = Number(modelProperties.context_size)
		}
		return new OllamaEmbeddings({
			baseUrl: ollamaCredentials?.base_url,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
			requestOptions
		})
	}

	async validateCredentials(model: string, credentials: OllamaCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			// const credentialsKwargs = this._toCredentialKwargs(credentials);
			const embeddings = new OllamaEmbeddings({
				baseUrl: credentials.base_url,
				// batchSize: 512, // Default value if omitted is 512. Max is 2048
				model
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
