import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { omit } from '@xpert-ai/ocap-core'
import { ComponentStore } from '@xpert-ai/store'
import {
  API_SUBSCRIPTION,
  C_API_STORY,
  C_API_STORY_POINT,
  C_API_STORY_WIDGET,
  convertStory,
  convertStoryPoint,
  convertStoryWidget
} from '@xpert-ai/cloud/state'
import {
  NxStoryStore,
  Story,
  StoryComment,
  StoryNotificationDestination,
  StoryPoint,
  StorySubscription,
  StoryWidget,
  StoryWidgetKey
} from '@xpert-ai/story/core'
import { Observable, of } from 'rxjs'
import { map, shareReplay } from 'rxjs/operators'
import { PACNotificationDestinationsService } from '../@core'
import {
  ID,
  IStory,
  IStoryWidget,
  ISubscription,
  convertStoryPointResult,
  convertStoryResult,
  convertStoryWidgetResult
} from '../@core/types'
import { convertStorySubscriptionResult } from './types'

@Injectable()
export class StoryStoreService extends ComponentStore<{ entities?: Array<Story> }> implements NxStoryStore {

  private httpClient = inject(HttpClient)
  private destinationService = inject(PACNotificationDestinationsService)

  readonly state$ = this.select((state) => {
    if (!state.entities) {
      this.refresh()
    }
    return state
  }).pipe(shareReplay())

  constructor() {
    super({})
  }

  createStory(story: Story): Observable<Story> {
    return this.httpClient.post<IStory>(C_API_STORY, convertStory(omit(story, 'points'))).pipe(map(convertStoryResult))
  }

  createStoryPoint(storyPoint: StoryPoint): Observable<StoryPoint> {
    return this.httpClient.post(C_API_STORY_POINT, convertStoryPoint(omit(storyPoint, 'widgets'))).pipe(map(convertStoryPointResult))
  }

  createStoryWidget(storyWidget: StoryWidget): Observable<StoryWidget> {
    return this.httpClient
      .post<IStoryWidget>(C_API_STORY_WIDGET, convertStoryWidget(storyWidget))
      .pipe(map(convertStoryWidgetResult))
  }

  updateStory(story: Story): Observable<void> {
    return this.httpClient.put(C_API_STORY + '/' + story.id, convertStory(omit(story, 'points', 'models'))).pipe(map(() => {}))
  }
  /**
   * @deprecated 应用场景 ???
   * 
   * @param id 
   * @param story 
   * @returns 
   */
  putStory(id: string, story: Partial<Story>) {
    return this.httpClient.put<Story>(C_API_STORY + '/' + id, story)
  }

  updateStoryPoint(storyPoint: StoryPoint): Observable<void> {
    return this.httpClient
      .put(C_API_STORY_POINT + '/' + storyPoint.id, convertStoryPoint(omit(storyPoint, 'widgets')))
      .pipe(map(convertStoryPointResult))
  }

  updateStoryWidget(storyWidget: StoryWidget): Observable<void> {
    return this.httpClient
      .put(C_API_STORY_WIDGET + '/' + storyWidget.id, convertStoryWidget(storyWidget))
      .pipe(map(() => {}))
  }

  removeStory(id: ID): Observable<void> {
    return this.httpClient.delete(C_API_STORY + '/' + id).pipe(map(() => {}))
  }

  removeStoryPoint(storyId: ID, pointId: ID): Observable<void> {
    return this.httpClient.delete(C_API_STORY_POINT + '/' + pointId).pipe(map(() => {}))
  }

  removeStoryWidget(storyId: ID, pointId: ID, widgetID: ID): Observable<void> {
    return this.httpClient.delete(C_API_STORY_WIDGET + '/' + widgetID).pipe(map(() => {}))
  }

  refresh() {
    return this.httpClient
      .get<Array<any>>(C_API_STORY)
      .pipe(map((items: Array<any>) => items.map(convertStoryResult)))
      .subscribe((stories: Array<Story>) => {
        this.updater((state, stories: Array<Story>) => {
          state.entities = stories
        })(stories)
      })
  }

  getStories(): Observable<Story[]> {
    return this.select(this.state$, (state) => state.entities)
  }

  getStory(id: ID): Observable<Story> {
    return this.httpClient
      .get<IStory>(C_API_STORY + '/' + id, {
        params: new HttpParams().append(
          '$query',
          JSON.stringify({
            relations: ['template', 'model', 'model.dataSource', 'model.dataSource.type', 'model.indicators', 'points']
          })
        )
      })
      .pipe(map(convertStoryResult))
  }

  getStoryPoint(storyId: ID, pointId: ID, options?: { token: string }): Observable<StoryPoint> {
    const { token } = options ?? {}
    let params = new HttpParams().append('$query', JSON.stringify({ relations: ['widgets'] }))
    if (token) {
      params = params.append('token', token)
    }
    return this.httpClient
      .get(`${C_API_STORY_POINT}/${pointId}`, { params })
      .pipe(map(convertStoryPointResult))
  }

  createComment(comment: StoryComment): Observable<StoryComment> {
    throw new Error('Method not implemented.')
  }

  getWidgetComments(key: StoryWidgetKey): Observable<StoryComment[]> {
    return of([])
  }

  // Subscriptions
  getSubscriptions(storyId: string): Observable<StorySubscription[]> {
    return this.httpClient
      .get<{ items: ISubscription[] }>(API_SUBSCRIPTION, {
        params: new HttpParams().append(
          '$query',
          JSON.stringify({
            where: { storyId },
            relations: ['destination']
          })
        )
      })
      .pipe(map(({ items }) => items.map(convertStorySubscriptionResult)))
  }

  getNotificationDestinations(): Observable<StoryNotificationDestination[]> {
    return this.destinationService.getAll()
  }

  getDestinationGroups(id: ID) {
    return this.destinationService.getGroups(id)
  }

  createSubscription(input: StorySubscription) {
    return this.httpClient.post<StorySubscription>(API_SUBSCRIPTION, input)
  }

  shareToken(id: string, validUntil?: any): Observable<string> {
    return this.httpClient.post<string>(
      C_API_STORY + '/' + id + '/share/token',
      { validUntil },
      {
        responseType: 'text' as 'json'
      }
    )
  }
}
