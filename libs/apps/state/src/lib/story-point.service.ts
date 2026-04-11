import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IStoryPoint } from '@xpert-ai/contracts'
import { C_API_STORY_POINT } from './constants'

@Injectable({
  providedIn: 'root'
})
export class StoryPointsService {
  constructor(private httpClient: HttpClient) {}

  getOne(id: string, relations?: string[], token?: string) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations })
      params = params.append('$query', query)
    }
    if (token) {
      params = params.append('token', token)
    }
    return this.httpClient.get<IStoryPoint>(`${C_API_STORY_POINT}/${id}`, { params })
  }

  getPublicOne(id: string, relations?: string[]) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations })
      params = params.append('$query', query)
    }
    return this.httpClient.get<IStoryPoint>(`${C_API_STORY_POINT}/public/${id}`, { params })
  }

  upload(point: IStoryPoint) {
    return this.httpClient.post<IStoryPoint>(C_API_STORY_POINT, point)
  }

  // /**
  //  * @deprecated Why is Story
  //  */
  // create(story: Story) {
  //   return this.httpClient.post(C_API_STORY_POINT, convertStory(story)).pipe(map(convertStoryResult))
  // }

  copy(id: string) {
    return this.httpClient.post(`${C_API_STORY_POINT}/${id}/copy`, {})
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_STORY_POINT}/${id}`)
  }
}
