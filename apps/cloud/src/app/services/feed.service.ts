import { Injectable } from '@angular/core'
import { NxStoryFeedService, StoryFeed } from '@xpert-ai/story/core'
import { Observable } from 'rxjs'
import { FeedsService } from '../@core/services'

@Injectable()
export class StoryFeedService implements NxStoryFeedService {
  constructor(private feedsService: FeedsService) {}

  createFeed(feed: StoryFeed): Observable<StoryFeed> {
    return this.feedsService.create(feed)
  }

  deleteFeed(uuid: string): Observable<void> {
    throw new Error('Method not implemented.')
    // return this.entityService.delete(uuid)
  }
  getMyFeed(): Observable<StoryFeed[]> {
    throw new Error('Method not implemented.')
    // return this.query({orderbys: ['LastChangeTime desc']}).pipe(map((result) => result.results.map(convertResult)))
    // return of(1).pipe(
    //   delayWhen(() => this.initialise$),
    //   switchMap(() => ))
    // )
  }
}
