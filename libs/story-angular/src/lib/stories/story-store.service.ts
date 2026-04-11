import { Injectable } from '@angular/core'
import {
  ID,
  NxStoryStore,
  Story,
  StoryComment,
  StoryNotificationDestination,
  StoryPoint,
  StorySubscription,
  StoryWidget,
  StoryWidgetKey
} from '@xpert-ai/story/core'
import { ZardToastService } from '@xpert-ai/headless-ui'
import { Observable, of } from 'rxjs'

@Injectable()
export class StoryStoreMockService implements NxStoryStore {
  constructor(private toast: ZardToastService) {}

  getNotificationDestinations(): Observable<StoryNotificationDestination[]> {
    throw new Error('Method not implemented.')
  }
  getSubscriptions(storyId: string): Observable<StorySubscription[]> {
    throw new Error('Method not implemented.')
  }
  getDestinationGroups(id: string): Observable<any[]> {
    throw new Error('Method not implemented.')
  }
  createSubscription(input: StorySubscription): Observable<StorySubscription> {
    throw new Error('Method not implemented.')
  }

  createComment(comment: StoryComment): Observable<StoryComment> {
    throw new Error('Method not implemented.')
  }
  getWidgetComments(key: StoryWidgetKey): Observable<StoryComment[]> {
    return of([])
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
  updateStoryPoint(storyPoint: StoryPoint): Observable<void> {
    throw new Error('Method not implemented.')
  }
  updateStoryWidget(storyWidget: StoryWidget): Observable<void> {
    this.toast.success('模拟更新成功!', { duration: 2000 })
    return of(null)
  }
  removeStory(id: ID): Observable<void> {
    throw new Error('Method not implemented.')
  }
  removeStoryPoint(storyId: ID, pointId: ID): Observable<void> {
    throw new Error('Method not implemented.')
  }
  removeStoryWidget(storyId: ID, pointId: ID, widgetID: ID): Observable<void> {
    throw new Error('Method not implemented.')
  }
  getStories(): Observable<Story[]> {
    throw new Error('Method not implemented.')
  }
  getStory(id: ID): Observable<Story> {
    throw new Error('Method not implemented.')
  }
  getStoryPoint(storyId: ID, pointId: ID): Observable<StoryPoint> {
    throw new Error('Method not implemented.')
  }
}
