

import { Injectable, Module } from '@nestjs/common'
import { ModelProvider } from '../../ai-provider'
import { toCredentialKwargs, JinaCredentials } from './types'
import { AiModelTypeEnum } from '@metad/contracts'
import { CredentialsValidateFailedError } from '../errors'
import { PROVIDE_AI_MODEL_TEXT_EMBEDDING } from '../../types/types'
import { JinaTextEmbeddingModel } from './text-embedding/text-embedding'

@Injectable()
export class JinaProvider extends ModelProvider {
    constructor() {
        super('jina')
    }

    getBaseUrl(credentials: JinaCredentials): string {
        const params = toCredentialKwargs(credentials)
        return params.baseUrl
    }

    getAuthorization(credentials: JinaCredentials): string {
        return `Bearer ${credentials.api_key}`
    }

    async validateProviderCredentials(credentials: JinaCredentials): Promise<void> {
        try {
            const modelInstance = this.getModelManager(AiModelTypeEnum.TEXT_EMBEDDING)

            await modelInstance.validateCredentials('jina-embeddings-v3', credentials)
        } catch (ex) {
            if (ex instanceof CredentialsValidateFailedError) {
                throw ex
            } else {
                this.logger.error(`${this.getProviderSchema().provider}: credentials verification failed`, ex.stack)
                throw ex
            }
        }
    }
}

@Module({
    providers: [
        JinaProvider,
        {
            provide: ModelProvider,
            useExisting: JinaProvider
        },
        {
            provide: PROVIDE_AI_MODEL_TEXT_EMBEDDING,
            useClass: JinaTextEmbeddingModel
        }
    ],
    exports: [JinaProvider]
})
export class JinaProviderModule {}
