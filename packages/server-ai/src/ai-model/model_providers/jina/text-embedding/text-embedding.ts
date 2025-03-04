

import { JinaEmbeddings } from "@langchain/community/embeddings/jina";
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Injectable } from '@nestjs/common'
import { ModelProvider } from '../../../ai-provider'
import { TextEmbeddingModelManager } from '../../../types/text-embedding-model'
import { CredentialsValidateFailedError } from '../../errors'
import { JinaCredentials, toCredentialKwargs } from '../types'

@Injectable()
export class JinaTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(readonly modelProvider: ModelProvider) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): JinaEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = toCredentialKwargs(modelProvider.credentials as JinaCredentials)

		return new JinaEmbeddings({
            ...params,
            model: copilotModel.model || copilotModel.copilot.copilotModel?.model, // Optional, defaults to "jina-clip-v2"
          });
	}

	async validateCredentials(model: string, credentials: JinaCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as JinaCredentials)
			const embeddings = new JinaEmbeddings({
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
