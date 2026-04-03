import { Signal } from '@angular/core'
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { BaseRetriever } from '@langchain/core/retrievers'
import {
  VectorStoreInterface,
  VectorStoreRetrieverInput,
  VectorStoreRetrieverInterface,
  VectorStoreRetrieverMMRSearchKwargs
} from '@langchain/core/vectorstores'
import { catchError, firstValueFrom, of, timeout } from 'rxjs'
import { SERVER_REQUEST_TIMEOUT } from '../config'
import { CopilotExampleService } from '../services/'

/**
 * Type for options when adding a document to the VectorStore.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AddDocumentOptions = Record<string, any>

/**
 * Class for performing document retrieval from a VectorStore. Can perform
 * similarity search or maximal marginal relevance search.
 */
/**
 * @deprecated use chatkit instead
 */
export class ExampleVectorStoreRetriever<V extends VectorStoreInterface = VectorStoreInterface>
  extends BaseRetriever
  implements VectorStoreRetrieverInterface
{
  static lc_name() {
    return 'VectorStoreRetriever'
  }

  get lc_namespace() {
    return ['langchain_core', 'vectorstores']
  }

  vectorStore: V

  k = 4

  searchType = 'similarity'

  searchKwargs?: VectorStoreRetrieverMMRSearchKwargs

  filter?: V['FilterType']

  command: string | string[]
  role: Signal<string>
  score?: number
  _vectorstoreType(): string {
    return this.vectorStore._vectorstoreType()
  }

  constructor(
    fields: VectorStoreRetrieverInput<V> & { command: string | string[]; role: Signal<string>; score?: number },
    private readonly service: CopilotExampleService
  ) {
    super(fields)
    this.vectorStore = fields.vectorStore
    this.k = fields.k ?? this.k
    this.searchType = fields.searchType ?? this.searchType
    this.filter = fields.filter
    if (fields.searchType === 'mmr') {
      this.searchKwargs = fields.searchKwargs
    }
    this.command = fields.command
    this.role = fields.role
    this.score = fields.score
  }

  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun
  ): Promise<DocumentInterface[]> {
    if (this.searchType === 'mmr') {
      if (typeof this.service.maxMarginalRelevanceSearch !== 'function') {
        throw new Error(
          `The vector store backing this retriever, ${this._vectorstoreType()} does not support max marginal relevance search.`
        )
      }
      return await firstValueFrom(
        this.service
          .maxMarginalRelevanceSearch(query, {
            k: this.k,
            filter: this.filter,
            command: this.command,
            role: this.role(),
            ...this.searchKwargs
          })
          .pipe(
            timeout(SERVER_REQUEST_TIMEOUT),
            catchError((error) => {
              return of([])
            })
          )
      )
    }

    return await firstValueFrom(
      this.service
        .similaritySearch(query, {
          command: this.command,
          k: this.k,
          filter: this.filter,
          role: this.role(),
          score: this.score
        })
        .pipe(
          timeout(SERVER_REQUEST_TIMEOUT),
          catchError((error) => {
            return of([])
          })
        )
    )
  }

  async addDocuments(documents: DocumentInterface[], options?: AddDocumentOptions): Promise<string[] | void> {
    return this.vectorStore.addDocuments(documents, options)
  }
}
