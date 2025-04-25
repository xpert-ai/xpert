import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { C_URI_API_MODELS, C_URI_API_MODEL_MEMBERS, convertNewSemanticModelResult } from '@metad/cloud/state'
import { IDimensionMember } from '@metad/ocap-core'
import { NxStoryModelService, StoryModel, StoryConnection } from '@metad/story/core'
import { isNil, omitBy } from 'lodash-es'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { convertStoryModel, ID, ISemanticModel } from '../@core/types'

@Injectable()
export class StoryModelService implements NxStoryModelService {
  constructor(private httpClient: HttpClient) {}

  getConnections(): Observable<StoryConnection[]> {
    throw new Error('Method not implemented.')
  }

  getModel(id: ID): Observable<StoryModel> {
    return this.httpClient
      .get<ISemanticModel>(C_URI_API_MODELS + '/' + id, {
        params: new HttpParams().append('$query', JSON.stringify({ relations: ['dataSource'] }))
      })
      .pipe(map(convertNewSemanticModelResult))
  }

  createModel(model: StoryModel): Observable<StoryModel> {
    return this.httpClient
      .post<ISemanticModel>(C_URI_API_MODELS, convertStoryModel(model))
      .pipe(map(convertNewSemanticModelResult))
  }

  removeModel(id: ID): Observable<void> {
    return this.httpClient.delete(C_URI_API_MODELS + '/' + id).pipe(map(() => {}))
  }

  updateModel(model: StoryModel): Observable<void> {
    return this.httpClient.put(C_URI_API_MODELS + '/' + model.id, convertStoryModel(model)).pipe(map(() => {}))
  }

  getModels(type?: string): Observable<StoryModel[]> {
    return this.httpClient
      .get<Array<ISemanticModel>>(C_URI_API_MODELS)
      .pipe(map((result: Array<ISemanticModel>) => result?.map(convertNewSemanticModelResult)))
  }

  getMembers(modelId: ID, entity: string, hierarchy: string): Observable<IDimensionMember[]> {
    return this.httpClient
      .get<{ items: Array<IDimensionMember> }>(C_URI_API_MODEL_MEMBERS, {
        params: new HttpParams().append(
          '$query',
          JSON.stringify({
            where: {
              modelId,
              entity,
              hierarchy
            }
          })
        )
      })
      .pipe(map((result) => result.items))
  }

  createMembers(members: IDimensionMember[]): Observable<IDimensionMember[]> {
    return this.httpClient.post<IDimensionMember[]>(C_URI_API_MODEL_MEMBERS, members)
  }

  removeMembers(modelId: string, entity: string, hierarchy: string, memberUniqueName?: string): Observable<void> {
    return this.httpClient.delete<void>(C_URI_API_MODEL_MEMBERS, {
      params: new HttpParams().append(
        '$query',
        JSON.stringify({
          where: omitBy(
            {
              modelId,
              entity,
              hierarchy,
              memberUniqueName
            },
            isNil
          )
        })
      )
    })
  }
}
