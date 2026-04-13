import { DragDropModule } from '@angular/cdk/drag-drop'

import { ChangeDetectorRef, Component, effect, inject, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { StoriesService } from '@xpert-ai/cloud/state'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { effectAction } from '@xpert-ai/ocap-angular/core'
import { WaIntersectionObserverDirective } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { debounceTime, distinctUntilChanged, switchMap, tap } from 'rxjs'
import { IStory, listAnimation } from '../../@core'
import { StoryCardComponent } from '../../@shared/story'
import { ZardButtonComponent, ZardToggleGroupComponent, ZardToggleGroupItemComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    RouterModule,
    WaIntersectionObserverDirective,
    ZardButtonComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    TranslateModule,
    NgmCommonModule,
    StoryCardComponent
],
  selector: 'pac-public-trending',
  templateUrl: 'trending.component.html',
  styleUrls: ['trending.component.scss'],
  animations: [listAnimation]
})
export class TrendingComponent {
  private readonly storiesService = inject(StoriesService)
  private readonly _cdr = inject(ChangeDetectorRef)

  searchControl = new FormControl()
  get highlight() {
    return this.searchControl.value
  }

  public trends = []
  private pageSize = 10
  private currentPage = 0
  private loading = false
  public done = false

  public get orderType() {
    return this._orderType()
  }
  set orderType(value) {
    this._orderType.set(value)
  }
  private readonly _orderType = signal<'visits' | 'update'>('visits')

  private searchSub = this.searchControl.valueChanges.pipe(distinctUntilChanged(), debounceTime(500)).subscribe(() => {
    this.currentPage = 0
    this.trends = []
    this.done = false
    this.loadTrends()
  })

  constructor() {
    effect(() => {
      if (this._orderType()) {
        this.currentPage = 0
        this.trends = []
        this.done = false
        this.loadTrends()
      }
    })
  }

  trackById(index: number, item: IStory) {
    return item.id
  }

  loadTrends = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => {
        this.loading = true
        return this.storiesService
          .getTrends(
            { take: this.pageSize, skip: this.currentPage * this.pageSize, orderType: this.orderType },
            this.highlight
          )
          .pipe(
            tap({
              next: (result) => {
                this.trends = [...this.trends, ...result.items]
                this.currentPage++
                if (result.items.length < this.pageSize || this.currentPage * this.pageSize >= result.total) {
                  this.done = true
                }

                console.log(this.trends)
              },
              error: (err) => {
                this.loading = false
                this._cdr.detectChanges()
              },
              complete: () => {
                this.loading = false
                this._cdr.detectChanges()
              }
            })
          )
      })
    )
  })

  onIntersection() {
    if (!this.loading) {
      this.loadTrends()
    }
  }
}
