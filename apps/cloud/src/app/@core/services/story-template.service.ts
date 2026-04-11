import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { IStoryTemplate } from '../types'

export const C_API_STORY_TEMPLATE = API_PREFIX + '/story-template'

@Injectable({
  providedIn: 'root'
})
export class StoryTemplateService {
  private readonly httpClient = inject(HttpClient)

  getAll(where?: Partial<IStoryTemplate>) {
    return this.httpClient.get<{ items: IStoryTemplate[] }>(C_API_STORY_TEMPLATE, {
      params: {
        data: JSON.stringify({
          relations: ['preview', 'tags', 'createdBy'],
          where
        })
      }
    })
  }

  getAllPublic(where?: Partial<IStoryTemplate>) {
    return this.httpClient.get<{ items: IStoryTemplate[] }>(C_API_STORY_TEMPLATE + '/public', {
      params: {
        data: JSON.stringify({
          relations: ['preview', 'tags', 'createdBy'],
          where
        })
      }
    })
  }
  
  getMy() {
    return this.httpClient.get<{ items: IStoryTemplate[] }>(C_API_STORY_TEMPLATE + '/my', {
      params: {
        data: JSON.stringify({
          relations: ['preview', 'tags', 'createdBy']
        })
      }
    })
  }

  getOne(id: string) {
    return this.httpClient.get<IStoryTemplate>(C_API_STORY_TEMPLATE + `/${id}`, {
      params: {
        data: JSON.stringify({
          relations: ['preview', 'tags', 'createdBy']
        })
      }
    })
  }

  getOneByStory(id: string) {
    return this.httpClient.get<IStoryTemplate>(C_API_STORY_TEMPLATE + `/story/${id}`, {
      params: {
        data: JSON.stringify({
          relations: ['preview', 'tags', 'createdBy']
        })
      }
    })
  }

  create(input: Partial<IStoryTemplate>) {
    return this.httpClient.post<IStoryTemplate>(C_API_STORY_TEMPLATE, input)
  }

  update(id: string, input: Partial<IStoryTemplate>) {
    return this.httpClient.put<IStoryTemplate>(`${C_API_STORY_TEMPLATE}/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_STORY_TEMPLATE}/${id}`)
  }
}
