import { Injectable } from '@nestjs/common'
import { IRetrieverStrategy, RetrieverStrategy, TRetrieverConfig } from '@xpert-ai/plugin-sdk'
import { Document } from '@langchain/core/documents'
import { VectorRetriever } from './types'

type TVectorRetrieverConfig = TRetrieverConfig

@Injectable()
@RetrieverStrategy(VectorRetriever)
export class VectorRetrieverStrategy implements IRetrieverStrategy<TVectorRetrieverConfig> {
    readonly meta = {
        name: VectorRetriever,
        label: {
            en_US: 'Vector Retriever',
            zh_Hans: '向量检索器'
        },
        configSchema: {},
        icon: {
            svg: ''
        }
    }

    async validateConfig(config: TVectorRetrieverConfig): Promise<void> {
        if (!config?.vectorStore) {
            throw new Error('Vector retriever requires a vector store.')
        }
    }

    async retrieve(query: string, options: TVectorRetrieverConfig): Promise<{ documents: Document[] }> {
        await this.validateConfig(options)
        const { vectorStore } = options
        const retriever = vectorStore.asRetriever()
        const documents = await retriever.invoke(query)
        return { documents }
    }
}
