import { VIRTUAL_SCROLL_STRATEGY } from '@angular/cdk/scrolling'
import { CdkHeaderRowDef, CdkTable } from '@angular/cdk/table'
import { AfterContentInit, ContentChild, Directive, forwardRef, Input, NgZone, OnChanges, OnDestroy } from '@angular/core'
import { Subject } from 'rxjs'
import { distinctUntilChanged, filter, map, switchMap, takeUntil, takeWhile, tap } from 'rxjs/operators'
import { FixedSizeTableVirtualScrollStrategy } from './fixed-size-table-virtual-scroll-strategy'
import { TableVirtualScrollDataSource } from './table-data-source'

export function _tableVirtualScrollDirectiveStrategyFactory(tableDir: TableItemSizeDirective) {
  return tableDir.scrollStrategy
}

const stickyHeaderSelector = 'thead [data-sticky-start], thead [data-sticky-end]'
const stickyFooterSelector = 'tfoot [data-sticky-start], tfoot [data-sticky-end]'

const defaults = {
  rowHeight: 48,
  headerHeight: 56,
  headerEnabled: true,
  footerHeight: 48,
  footerEnabled: false,
  bufferMultiplier: 0.7
}

@Directive({
  selector: 'cdk-virtual-scroll-viewport[tvsItemSize]',
  standalone: false,
  providers: [
    {
      provide: VIRTUAL_SCROLL_STRATEGY,
      useFactory: _tableVirtualScrollDirectiveStrategyFactory,
      deps: [forwardRef(() => TableItemSizeDirective)]
    }
  ]
})
export class TableItemSizeDirective implements OnChanges, AfterContentInit, OnDestroy {
  private alive = true

  @Input('tvsItemSize')
  rowHeight = defaults.rowHeight

  @Input()
  headerEnabled = defaults.headerEnabled

  @Input()
  headerHeight = defaults.headerHeight

  @Input()
  footerEnabled = defaults.footerEnabled

  @Input()
  footerHeight = defaults.footerHeight

  @Input()
  bufferMultiplier = defaults.bufferMultiplier

  @ContentChild(CdkTable, { static: false })
  table: CdkTable<unknown>

  scrollStrategy = new FixedSizeTableVirtualScrollStrategy()

  dataSourceChanges = new Subject<void>()

  private stickyPositions: Map<HTMLElement, number>

  constructor(private zone: NgZone) {}

  ngOnDestroy() {
    this.alive = false
    this.dataSourceChanges.complete()
  }

  private isAlive() {
    return () => this.alive
  }

  private isStickyEnabled(): boolean {
    return !!this.scrollStrategy.viewport && ((this.table?.['_headerRowDefs'] as CdkHeaderRowDef[]) ?? [])
      .map((def) => def.sticky)
      .reduce((prevState, state) => prevState && state, true)
  }

  ngAfterContentInit() {
    if (!this.table) {
      return
    }

    const switchDataSourceOrigin = this.table['_switchDataSource']
    this.table['_switchDataSource'] = (dataSource: unknown) => {
      switchDataSourceOrigin.call(this.table, dataSource)
      this.connectDataSource(dataSource)
    }

    this.connectDataSource(this.table.dataSource)

    this.scrollStrategy.stickyChange
      .pipe(
        filter(() => this.isStickyEnabled()),
        tap(() => {
          if (!this.stickyPositions) {
            this.initStickyPositions()
          }
        }),
        takeWhile(this.isAlive())
      )
      .subscribe((stickyOffset) => {
        this.setSticky(stickyOffset)
      })
  }

  connectDataSource(dataSource: unknown) {
    this.dataSourceChanges.next()
    if (dataSource instanceof TableVirtualScrollDataSource) {
      dataSource.dataToRender$
        .pipe(
          distinctUntilChanged(),
          takeUntil(this.dataSourceChanges),
          takeWhile(this.isAlive()),
          tap((data) => {
            this.scrollStrategy.dataLength = data.length
          }),
          switchMap((data) =>
            this.scrollStrategy.renderedRangeStream.pipe(
              map(({ start, end }) => (typeof start !== 'number' || typeof end !== 'number' ? data : data.slice(start, end)))
            )
          )
        )
        .subscribe((data) => {
          this.zone.run(() => {
            dataSource.dataOfRange$.next(data)
          })
        })
    } else if (dataSource) {
      throw new Error('[tvsItemSize] requires TableVirtualScrollDataSource be set as the table data source.')
    }
  }

  ngOnChanges() {
    const config = {
      rowHeight: +this.rowHeight || defaults.rowHeight,
      headerHeight: this.headerEnabled ? +this.headerHeight || defaults.headerHeight : 0,
      footerHeight: this.footerEnabled ? +this.footerHeight || defaults.footerHeight : 0,
      bufferMultiplier: +this.bufferMultiplier || defaults.bufferMultiplier
    }
    this.scrollStrategy.setConfig(config)
  }

  setSticky(offset: number) {
    this.scrollStrategy.viewport.elementRef.nativeElement.querySelectorAll(stickyHeaderSelector).forEach((el: Element) => {
      const parent = el.parentElement
      let baseOffset = 0
      if (parent && this.stickyPositions.has(parent)) {
        baseOffset = this.stickyPositions.get(parent)
      }

      ;(el as HTMLElement).style.top = `${baseOffset - offset}px`
    })

    this.scrollStrategy.viewport.elementRef.nativeElement.querySelectorAll(stickyFooterSelector).forEach((el: Element) => {
      const parent = el.parentElement
      let baseOffset = 0
      if (parent && this.stickyPositions.has(parent)) {
        baseOffset = this.stickyPositions.get(parent)
      }

      ;(el as HTMLElement).style.bottom = `${-baseOffset + offset}px`
    })
  }

  private initStickyPositions() {
    this.stickyPositions = new Map<HTMLElement, number>()
    this.scrollStrategy.viewport.elementRef.nativeElement.querySelectorAll(stickyHeaderSelector).forEach((el: Element) => {
      const parent = el.parentElement
      if (parent && !this.stickyPositions.has(parent)) {
        this.stickyPositions.set(parent, parent.offsetTop)
      }
    })
  }
}
