import { Injectable } from '@angular/core'
import { Document } from '@langchain/core/documents'
import { API_PREFIX, ISemanticModelMember, OrganizationBaseCrudService } from '@metad/cloud/state'

export const C_API_SEMANTIC_MODEL_MEMBER = API_PREFIX + '/semantic-model-member'

@Injectable({
  providedIn: 'root'
})
export class SemanticModelMemberService extends OrganizationBaseCrudService<ISemanticModelMember> {
  constructor() {
    super(C_API_SEMANTIC_MODEL_MEMBER)
  }

  retrieve(params: {
    modelId: string
    cube: string
    dimension: string
    hierarchy: string
    level: string
    query: string
    k: number
  }) {
    return this.httpClient.post<
      [
        Document<{
          dimension: string
          hierarchy: string
          id: string
          key: string
          level: string
          member: string
        }>,
        number
      ][]
    >(`${this.apiBaseUrl}/retrieve`, params)
  }
}
