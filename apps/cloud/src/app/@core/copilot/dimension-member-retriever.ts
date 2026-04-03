import { Inject, Injectable, Optional, inject } from '@angular/core'
import type { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager'
import { Document } from '@langchain/core/documents'
import { type BaseRetrieverInput } from '@langchain/core/retrievers'
import { SemanticModelServerService } from '@metad/cloud/state'
import { BaseDimensionMemberRetriever, MEMBER_RETRIEVER_TOKEN } from '@metad/core'
import { NGXLogger } from 'ngx-logger'
import { catchError, firstValueFrom, of, timeout } from 'rxjs'
import { SERVER_REQUEST_TIMEOUT } from '../config'

/**
 * @deprecated use chatkit instead
 */
@Injectable()
export class CustomRetrieverInput implements BaseRetrieverInput {}

/**
 * @deprecated use chatkit instead
 */
@Injectable()
export class DimensionMemberRetriever extends BaseDimensionMemberRetriever {
  readonly #logger = inject(NGXLogger)
  readonly modelsService = inject(SemanticModelServerService)

  lc_namespace = ['langchain', 'retrievers']

  constructor(@Inject(CustomRetrieverInput) @Optional() fields?: CustomRetrieverInput) {
    super(fields)
  }

  async _getRelevantDocuments(query: string, runManager?: CallbackManagerForRetrieverRun): Promise<Document[]> {
    // Pass `runManager?.getChild()` when invoking internal runnables to enable tracing
    // const additionalDocs = await someOtherRunnable.invoke(params, runManager?.getChild());

    this.#logger.debug(`Retrieving documents for query: ${query}`, runManager)
    const modelId = this.model?.() ?? this.metadata.modelId as string ?? ''
    const cube = this.cube?.() ?? this.metadata.cube as string

    const results = await firstValueFrom(
      this.modelsService.getRelevantMembers(modelId, cube, query, 6).pipe(
        timeout(SERVER_REQUEST_TIMEOUT),
        catchError((error) => {
          this.#logger.error('Error while fetching similar documents', error)
          return of([])
        })
      )
    )

    this.#logger.debug(`Retrievd member documents for query: ${query}`, results)

    return results.map((item) => new Document(item))
  }
}

/**
 * @deprecated use chatkit instead
 */
export function provideDimensionMemberRetriever() {
  return {
    provide: MEMBER_RETRIEVER_TOKEN,
    useClass: DimensionMemberRetriever
  }
}
