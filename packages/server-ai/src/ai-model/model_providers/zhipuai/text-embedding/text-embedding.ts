import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { CredentialsValidateFailedError } from '../../errors'
import { toCredentialKwargs, ZhipuaiCredentials, ZhipuaiTextEmbeddingModelOptions } from '../types'

@Injectable()
export class ZhipuaiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const options = copilotModel.options as ZhipuaiTextEmbeddingModelOptions
		const params = toCredentialKwargs(modelProvider.credentials as ZhipuaiCredentials)

		return new OpenAIEmbeddings({
			...params,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
			batchSize: options?.max_chunks
		})
	}

	async validateCredentials(model: string, credentials: ZhipuaiCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as ZhipuaiCredentials)
			const embeddings = new OpenAIEmbeddings({
				...params,
				model
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
