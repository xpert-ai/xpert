import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { AccessEnum, IPagination, IStory } from '@xpert-ai/contracts'
import { Story } from '@xpert-ai/story/core'
import { map, Observable } from 'rxjs'
import { C_API_STORY } from './constants'
import { OrganizationBaseService } from './organization-base.service'
import { convertStory, convertStoryResult } from './types'

const C_API_STORY_PUBLIC = C_API_STORY + '/public/'

@Injectable({
  providedIn: 'root'
})
export class StoriesService extends OrganizationBaseService {
  constructor(private httpClient: HttpClient) {
    super()
  }

  getCatalogs(relations: Array<string> = []) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations, order: { updatedAt: 'DESC' } })
      params = params.append('$query', query)
    }
    return this.httpClient
      .get<{ items: Array<IStory> }>(C_API_STORY + '/catalog', { params })
      .pipe(map(({ items }) => items))
  }

  getOne(id: string, relations?: string[], token?: string): Observable<IStory> {
    let params = new HttpParams().append(
      '$query',
      JSON.stringify({
        relations: relations ?? [
          'template',
          'asTemplate',
          'preview',
          'model',
          'model.dataSource',
          'model.dataSource.type',
          'model.indicators',
          'models',
          'models.dataSource',
          'models.dataSource.type',
          'models.indicators',
          'points'
        ]
      })
    )
    if (token) {
      params = params.append('token', token)
    }
    return this.httpClient.get<IStory>(C_API_STORY + '/' + id, {
      params
    })
  }

  getPublicOne(id: string): Observable<IStory> {
    return this.httpClient.get<IStory>(C_API_STORY_PUBLIC + id, {
      params: new HttpParams().append(
        '$query',
        JSON.stringify({
          relations: [
            'createdBy',
            'template',
            'model',
            'model.dataSource',
            'model.dataSource.type',
            'model.indicators',
            'models',
            'models.dataSource',
            'models.dataSource.type',
            'models.indicators',
            'points'
          ]
        })
      )
    })
  }

  getAllByProject(project: string, relations: Array<string> = [], take?: number) {
    let params = new HttpParams()
    const query = { relations, order: { updatedAt: 'DESC' } } as any
    if (take) {
      query.take = take
    }
    params = params.append('$query', JSON.stringify(query))
    return this.httpClient
      .get<{ items: Array<IStory> }>(C_API_STORY, { params: params.append('project', project) })
      .pipe(map(({ items }) => items))
  }

  upload(story: IStory) {
    return this.httpClient.post<IStory>(C_API_STORY, story)
  }

  create(story: Partial<Story>) {
    return this.httpClient.post(C_API_STORY, convertStory(story)).pipe(map(convertStoryResult))
  }

  import(story: Partial<IStory>) {
    return this.httpClient.post<IStory>(C_API_STORY + '/import', story)
  }

  update(id: string, story: Partial<IStory>) {
    return this.httpClient.put<IStory>(`${C_API_STORY}/${id}`, story)
  }

  copy(id: string, story: Partial<IStory>) {
    return this.httpClient.post<IStory>(`${C_API_STORY}/${id}/copy`, {
      ...story
    })
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_STORY}/${id}`)
  }

  count() {
    return this.httpClient.get<number>(C_API_STORY + `/count`)
  }

  getTrends(params: { skip: number; take: number; orderType: 'visits' | 'update' }, searchText?: string) {
    return this.httpClient.get<IPagination<IStory>>(C_API_STORY_PUBLIC + 'trends', {
      params: {
        ...params,
        relations: ['createdBy', 'updatedBy', 'preview'],
        searchText: searchText || ''
      }
    })
  }

  updateModels(id: string, models: Array<string>) {
    return this.httpClient.put<IStory>(`${C_API_STORY}/${id}/models`, models, {
      params: {
        relations: [
          'models',
          'models.dataSource',
          'models.dataSource.type',
          'models.indicators',
        ].join(',')
      }
    })
  }

  getAccess(id: string) {
    return this.httpClient.get<{access: AccessEnum}>(`${C_API_STORY}/${id}/access`)
  }
}
