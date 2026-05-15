import { Injectable } from '@angular/core'
import { distinctUntilChanged } from 'rxjs/operators'
import { BehaviorSubject, Subject } from 'rxjs'
import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling'
import { ListRange } from '@angular/cdk/collections'

export interface TSVStrategyConfigs {
  rowHeight: number
  headerHeight: number
  footerHeight: number
  bufferMultiplier: number
}

@Injectable()
export class FixedSizeTableVirtualScrollStrategy implements VirtualScrollStrategy {
  private rowHeight!: number
  private headerHeight!: number
  private footerHeight!: number
  private bufferMultiplier!: number
  private indexChange = new Subject<number>()
  public stickyChange = new Subject<number>()

  public viewport: CdkVirtualScrollViewport

  public renderedRangeStream = new BehaviorSubject<ListRange>({ start: 0, end: 0 })

  public scrolledIndexChange = this.indexChange.pipe(distinctUntilChanged())

  get dataLength(): number {
    return this._dataLength
  }

  set dataLength(value: number) {
    this._dataLength = value
    this.onDataLengthChanged()
  }

  private _dataLength = 0

  public attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport
    this.viewport.renderedRangeStream.subscribe(this.renderedRangeStream)
    this.onDataLengthChanged()
  }

  public detach(): void {
    this.indexChange.complete()
    this.stickyChange.complete()
    this.renderedRangeStream.complete()
  }

  public onContentScrolled(): void {
    this.updateContent()
  }

  public onDataLengthChanged(): void {
    if (this.viewport) {
      this.viewport.setTotalContentSize(this.dataLength * this.rowHeight + this.headerHeight + this.footerHeight)
    }
    this.updateContent()
  }

  public onContentRendered(): void {
    // no-op
  }

  public onRenderedOffsetChanged(): void {
    // no-op
  }

  public scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    if (!this.viewport || !this.rowHeight) {
      return
    }
    this.viewport.scrollToOffset((index - 1) * this.rowHeight + this.headerHeight)
  }

  public setConfig(configs: TSVStrategyConfigs) {
    const { rowHeight, headerHeight, footerHeight, bufferMultiplier } = configs
    if (
      this.rowHeight === rowHeight &&
      this.headerHeight === headerHeight &&
      this.footerHeight === footerHeight &&
      this.bufferMultiplier === bufferMultiplier
    ) {
      return
    }
    this.rowHeight = rowHeight
    this.headerHeight = headerHeight
    this.footerHeight = footerHeight
    this.bufferMultiplier = bufferMultiplier
    this.onDataLengthChanged()
  }

  private updateContent() {
    if (!this.viewport || !this.rowHeight) {
      return
    }
    const scrollOffset = this.viewport.measureScrollOffset()
    const amount = Math.ceil(this.viewport.getViewportSize() / this.rowHeight)
    const offset = Math.max(scrollOffset - this.headerHeight, 0)
    const buffer = Math.ceil(amount * this.bufferMultiplier)

    const skip = Math.round(offset / this.rowHeight)
    const index = Math.max(0, skip)
    const start = Math.max(0, index - buffer)
    const end = Math.min(this.dataLength, index + amount + buffer)
    const renderedOffset = start * this.rowHeight
    this.viewport.setRenderedContentOffset(renderedOffset)
    this.viewport.setRenderedRange({ start, end })
    this.indexChange.next(index)
    this.stickyChange.next(renderedOffset)
  }
}
