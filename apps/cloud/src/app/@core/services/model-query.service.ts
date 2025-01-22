import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX, SemanticModelServerService } from '@metad/cloud/state'
import { IModelQuery } from '@metad/contracts'
import { omit, pick } from '@metad/ocap-core'
import { map } from 'rxjs'

export interface ModelQuery extends IModelQuery {
  id?: string
  key: string
  modelId: string
  name: string
  entities: string[]
  statement?: string
  aiOptions?: any // AIOptions
  conversations?: Array<any> // CopilotChatConversation
}

@Injectable({ providedIn: 'root' })
export class ModelQueryService {
  private httpClient = inject(HttpClient)
  private modelsService = inject(SemanticModelServerService)


  create(input: Partial<ModelQuery>) {
    return this.httpClient.post<IModelQuery>(API_PREFIX + '/model-query', convertModelQueryInput(input))
  }

  update(id: string, input: Partial<ModelQuery>) {
    return this.httpClient.put(API_PREFIX + `/model-query/${id}`, convertModelQueryInput(input))
  }

  delete(id: string) {
    return this.httpClient.delete(API_PREFIX + `/model-query/${id}`)
  }

  getByModel(modelId: string) {
    return this.modelsService.getById(modelId, {relations: ['queries']}).pipe(
      map((model) => model.queries.map(convertModelQueryResult))
    )
  }
}

export function convertModelQueryInput(query: Partial<ModelQuery>): IModelQuery {
  return {
    ...pick(query, 'key', 'name', 'modelId', 'index'),
    options: pick(query, 'statement', 'entities', 'conversations')
  } as IModelQuery
}

export function convertModelQueryResult(query: IModelQuery): ModelQuery {
  return {
    ...omit(query, 'statement', 'entities', 'options'),
    ...(query.options ?? {})
  }
}
