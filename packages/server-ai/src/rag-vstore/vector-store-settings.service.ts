import { BadRequestException, Injectable } from '@nestjs/common'
import { KnowledgeVectorStoreOptions, VectorTypeEnum } from '@xpert-ai/contracts'
import { VectorStoreRegistry } from '@xpert-ai/plugin-sdk'
import { environment } from '@xpert-ai/server-config'
import { t } from 'i18next'

@Injectable()
export class VectorStoreSettingsService {
    constructor(private readonly registry: VectorStoreRegistry) {}

    options(): KnowledgeVectorStoreOptions {
        return {
            default: environment.vectorStore,
            stores: [VectorTypeEnum.PGVECTOR, VectorTypeEnum.MILVUS]
                .filter((type) => type === VectorTypeEnum.PGVECTOR || !!this.registry.get(type))
                .map((type) => ({ type }))
        }
    }

    forCreate(value: VectorTypeEnum | null | undefined): VectorTypeEnum {
        const type = value ?? environment.vectorStore
        const selectable = value == null || [VectorTypeEnum.PGVECTOR, VectorTypeEnum.MILVUS].includes(value)
        if (!selectable || (type !== VectorTypeEnum.PGVECTOR && !this.registry.get(type))) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeVectorStoreUnavailable', {
                    defaultValue: 'The selected vector store is not available.',
                    vectorStore: type
                })
            )
        }
        return type
    }

    assertUnchanged(current: VectorTypeEnum | null | undefined, requested: VectorTypeEnum | null | undefined) {
        if (requested !== undefined && requested !== (current ?? environment.vectorStore)) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeVectorStoreImmutable', {
                    defaultValue: 'Vector storage cannot be changed after a knowledgebase is created.'
                })
            )
        }
    }
}
