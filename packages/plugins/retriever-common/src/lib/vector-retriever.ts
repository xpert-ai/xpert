import { Injectable } from '@nestjs/common'
import { IRetrieverStrategy, RetrieverStrategy, TRetrieverConfig } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { VectorRetriever } from './types'

type TVectorRetrieverConfig = TRetrieverConfig & {
  //
}

@Injectable()
@RetrieverStrategy(VectorRetriever)
export class VectorRetrieverStrategy implements IRetrieverStrategy<TVectorRetrieverConfig> {
  meta = {
    name: VectorRetriever,
    label: {
      en_US: 'Vector Retriever',
      zh_CN: '向量检索器',
    },
    configSchema: {},
    icon: {
      svg: '',
    }
  }

  validateConfig(config: any): Promise<void> {
    throw new Error('Method not implemented.')
  }
  
  retrieve(query: string, options: TVectorRetrieverConfig): Promise<{ documents: Document[] }> {
    const { vectorStore } = options
    const retriever = vectorStore.asRetriever()
    retriever.invoke(query)
    throw new Error('Method not implemented.')
  }
}
