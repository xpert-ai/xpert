import { InjectionToken } from '@angular/core'
import { ID } from '@xpert-ai/contracts'
import { IDimensionMember } from '@xpert-ai/ocap-core'
import { Observable } from 'rxjs'
import { StoryModel, StoryConnection } from './types'

export const NX_STORY_MODEL = new InjectionToken<NxStoryModelService>('Nx Story Model Service')

/**
 * 语意模型
 * 可以参考 [Cube.js](https://cube.dev/) 对模型的定义
 * 未来与 MDX Schema 合并 ???
 */
export interface NxStoryModelService {
  getModel(id: ID): Observable<StoryModel>
  createModel(model: StoryModel): Observable<StoryModel>
  updateModel(model: StoryModel): Observable<void>
  removeModel(id: ID): Observable<void>

  getModels(type?: string): Observable<Array<StoryModel>>
  getConnections(): Observable<Array<StoryConnection>>

  getMembers(id: ID, entity: string, hierarchy: string): Observable<Array<IDimensionMember>>
  createMembers(member: IDimensionMember[]): Observable<IDimensionMember[]>
  removeMembers(id: ID, entity: string, hierarchy: string): Observable<void>
}
