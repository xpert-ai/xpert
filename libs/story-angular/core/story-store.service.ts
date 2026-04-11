import { InjectionToken } from '@angular/core'
import { ID } from '@xpert-ai/contracts'
import { Observable } from 'rxjs'
import {
  Story,
  StoryComment,
  StoryNotificationDestination,
  StoryPoint,
  StorySubscription,
  StoryWidget,
  StoryWidgetKey
} from './types'

export const NX_STORY_STORE = new InjectionToken<NxStoryStore>('Nx Story Store Service')

/**
 * 存储 Story 配置的服务抽象接口
 */
export interface NxStoryStore {
  createStory(story: Partial<Story>): Observable<Story>
  createStoryPoint(storyPoint: Partial<StoryPoint>): Observable<StoryPoint>
  createStoryWidget(storyWidget: Partial<StoryWidget>): Observable<StoryWidget>
  updateStory(story: Story): Observable<void>
  putStory(id: string, story: Partial<Story>): Observable<Story>
  updateStoryPoint(storyPoint: Partial<StoryPoint>): Observable<void>
  updateStoryWidget(storyWidget: Partial<StoryWidget>): Observable<void>
  removeStory(id: ID): Observable<void>
  removeStoryPoint(storyId: ID, pointId: ID): Observable<void>
  removeStoryWidget(storyId: ID, pointId: ID, widgetID: ID): Observable<void>

  getStories(): Observable<Array<Story>>
  getStory(id: ID): Observable<Story>
  getStoryPoint(storyId: ID, pointId: ID, options?: { token: string }): Observable<StoryPoint>

  // Comments
  createComment(comment: StoryComment): Observable<StoryComment>
  getWidgetComments(key: StoryWidgetKey): Observable<Array<StoryComment>>

  // Subscriptions
  getNotificationDestinations(): Observable<StoryNotificationDestination[]>
  getSubscriptions(storyId: ID): Observable<StorySubscription[]>
  getDestinationGroups(id: ID): Observable<any[]>
  createSubscription(input: StorySubscription): Observable<StorySubscription>

  // Alerts

  // Shares
  shareToken(id: string, validUntil?: any): Observable<string>
}
