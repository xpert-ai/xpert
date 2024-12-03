import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { ISemanticModelEntity } from '../types'

export const C_API_SEMANTIC_MODEL_ENTITY = API_PREFIX + '/semantic-model-entity'

@Injectable({
  providedIn: 'root'
})
export class SemanticModelEntityService {
  private readonly httpClient = inject(HttpClient)

  getAll(modelId: string) {

    return this.httpClient.get<{items: ISemanticModelEntity[], total: number}>(C_API_SEMANTIC_MODEL_ENTITY, {
      params: {
        $filter: JSON.stringify({
          modelId
        })
      }
    })
  }

  getOne(id: string) {
    return this.httpClient.get<ISemanticModelEntity>(`${C_API_SEMANTIC_MODEL_ENTITY}/${id}`)
  }

  create(modelId: string, input: Partial<ISemanticModelEntity>) {
    return this.httpClient.post<ISemanticModelEntity>(C_API_SEMANTIC_MODEL_ENTITY + `/${modelId}`, input)
  }

  update(id: string, input: Partial<ISemanticModelEntity>) {
    return this.httpClient.put(`${C_API_SEMANTIC_MODEL_ENTITY}/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_SEMANTIC_MODEL_ENTITY}/${id}`)
  }

  stopJob(id: string) {
    return this.httpClient.delete(`${C_API_SEMANTIC_MODEL_ENTITY}/${id}/job`)
  }
}
