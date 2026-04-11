import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { BusinessType, IStory, IStoryWidget } from '@xpert-ai/contracts'
import { hierarchize } from '@xpert-ai/ocap-core'
import { StoryWidget } from '@xpert-ai/story/core'
import { combineLatestWith, map } from 'rxjs'
import { C_API_STORY_WIDGET } from './constants'
import { FavoritesService } from './favorite.service'
import { convertStoryResult, convertStoryWidget, convertStoryWidgetResult } from './types'
import { BusinessAreaUserService } from './business-area-user.service'


@Injectable({
  providedIn: 'root'
})
export class WidgetsService {
  private httpClient = inject(HttpClient)
  private userBusinessAreas = inject(BusinessAreaUserService)
  private favoritesService = inject(FavoritesService)

  getAll(relations: Array<string> = []) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations, order: { updatedAt: 'DESC' } })
      params = params.append('$query', query)
    }

    return this.httpClient
      .get<{ items: Array<IStory> }>(C_API_STORY_WIDGET, { params })
      .pipe(map(({ items }) => items.map(convertStoryResult)))
  }

  getMyByGroupTree(relations?: string[]) {
    return this.userBusinessAreas.getMy(['businessArea']).pipe(
      map((areas) => areas.map(({ businessArea }) => businessArea)),
      combineLatestWith(this.favoritesService.getByType(BusinessType.STORY), this.getAll(relations)),
      map(([areas, favorites, stories]) => {
        return (
          hierarchize(
            [
              ...stories.map((item) => ({
                ...item,
                parentId: item.businessAreaId,
                favoriteId: favorites.find(({ storyId }) => storyId === item.id)?.id
              })),
              ...areas
            ],
            {
              parentNodeProperty: 'parentId',
              valueProperty: 'id',
              labelProperty: 'name'
            }
          ) ?? []
        )
      })
    )
  }

  getOne(id: string, relations?: string[]) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations })
      params = params.append('$query', query)
    }
    return this.httpClient.get<IStoryWidget>(`${C_API_STORY_WIDGET}/${id}`, { params })
  }

  getPublicOne(id: string, relations?: string[]) {
    let params = new HttpParams()
    if (relations) {
      const query = JSON.stringify({ relations })
      params = params.append('$query', query)
    }
    return this.httpClient.get<IStoryWidget>(`${C_API_STORY_WIDGET}/public/${id}`, { params })
  }

  upload(widget: IStoryWidget) {
    return this.httpClient.post<IStoryWidget>(C_API_STORY_WIDGET, widget)
  }

  create(widget: StoryWidget) {
    return this.httpClient.post<IStoryWidget>(C_API_STORY_WIDGET, convertStoryWidget(widget))
      .pipe(
        map((result) => convertStoryWidgetResult(result))
      )
  }

  copy(id: string) {
    return this.httpClient.post(`${C_API_STORY_WIDGET}/${id}/copy`, {})
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_STORY_WIDGET}/${id}`)
  }
}
