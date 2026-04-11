import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { C_API_STORY_POINT, API_SUBSCRIPTION, C_API_STORY } from '@xpert-ai/cloud/state'
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
import { map } from 'rxjs/operators'
import { PACNotificationDestinationsService } from '../@core'
import {
  convertStoryPointResult,
  convertStoryResult,
  ID,
  IStory,
  ISubscription
} from '../@core/types'
import { convertStorySubscriptionResult } from './types'

@Injectable()
export class StoryPublicService implements NxStoryStore {
  constructor(private httpClient: HttpClient, private destinationService: PACNotificationDestinationsService) {}
  shareToken(id: string, validUntil?: any): Observable<string> {
    throw new Error('Method not implemented.')
  }
  createStory(story: Story): Observable<Story> {
    throw new Error('Method not implemented.')
  }
  createStoryPoint(storyPoint: StoryPoint): Observable<StoryPoint> {
    throw new Error('Method not implemented.')
  }
  createStoryWidget(storyWidget: StoryWidget): Observable<StoryWidget> {
    throw new Error('Method not implemented.')
  }
  updateStory(story: Story): Observable<void> {
    throw new Error('Method not implemented.')
  }
  putStory(id: string, story: Partial<Story>): Observable<Story> {
    throw new Error('Method not implemented.')
  }
  updateStoryPoint(storyPoint: StoryPoint): Observable<void> {
    throw new Error('Method not implemented.')
  }
  updateStoryWidget(storyWidget: StoryWidget): Observable<void> {
    throw new Error('Method not implemented.')
  }
  removeStory(id: string): Observable<void> {
    throw new Error('Method not implemented.')
  }
  removeStoryPoint(storyId: string, pointId: string): Observable<void> {
    throw new Error('Method not implemented.')
  }
  removeStoryWidget(storyId: string, pointId: string, widgetID: string): Observable<void> {
    throw new Error('Method not implemented.')
  }
  getStories(): Observable<Story[]> {
    throw new Error('Method not implemented.')
  }
  createComment(comment: StoryComment): Observable<StoryComment> {
    throw new Error('Method not implemented.')
  }
  createSubscription(input: StorySubscription): Observable<StorySubscription> {
    throw new Error('Method not implemented.')
  }

  getStory(id: ID): Observable<Story> {
    return this.httpClient
      .get<IStory>(C_API_STORY + '/public/' + id, {
        params: new HttpParams().append(
          '$query',
          JSON.stringify({
            relations: ['model', 'model.dataSource', 'model.dataSource.type', 'model.indicators', 'points']
          })
        )
      })
      .pipe(map(convertStoryResult))
  }

  getStoryPoint(storyId: ID, pointId: ID): Observable<StoryPoint> {
    return this.httpClient
      .get(`${C_API_STORY_POINT}/public/${pointId}`, {
        params: new HttpParams().append('$query', JSON.stringify({ relations: ['widgets'] }))
      })
      .pipe(map(convertStoryPointResult))
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
}
