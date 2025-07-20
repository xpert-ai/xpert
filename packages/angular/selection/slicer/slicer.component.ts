import { Component, EventEmitter, Output, booleanAttribute, computed, inject, input } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import {
  ISlicer,
  advancedSlicerAsString,
  getEntityProperty,
  isAdvancedFilter,
  isAdvancedSlicer,
  isTimeRangesSlicer,
  nonNullable,
  slicerAsString,
  timeRangesSlicerAsString
} from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { combineLatest, combineLatestWith, filter, map } from 'rxjs'
import { BaseSlicersComponent } from '../base-slicers'

@Component({
  selector: 'ngm-slicer',
  templateUrl: 'slicer.component.html',
  styleUrls: ['slicer.component.scss']
})
export class SlicerComponent extends BaseSlicersComponent {
  private translate = inject(TranslateService)

  // Inputs
  readonly slicer = input<ISlicer>()
  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly limit = input<number>()

  @Output() removed = new EventEmitter()
  @Output() slicerChange = new EventEmitter<ISlicer>()

  public readonly title$ = combineLatest([
    toObservable(this.slicer).pipe(filter((value) => !!value)),
    this.entityType$
  ]).pipe(
    map(([slicer, entityType]) => {
      const SELECTION = this.translate.instant('Ngm.Selection', { Default: {} })

      if (isAdvancedSlicer(slicer)) {
        return SELECTION?.AdvancedSlicer ?? 'Advanced Slicer'
      }

      if (isAdvancedFilter(slicer)) {
        return SELECTION?.CombinationSlicer ?? 'Combination Slicer'
      }

      if (entityType) {
        if (slicer.dimension.parameter) {
          const property = entityType.parameters[slicer.dimension.parameter]
          return property.caption || property.name
        }
        const property = getEntityProperty(entityType, slicer.dimension)
        return property?.caption || property?.name
      }
      return slicer.dimension?.dimension
    })
  )

  readonly exclude = computed(() => this.slicer()?.exclude)
  public readonly members = computed(
    () =>
      this.slicer()
        ?.members?.slice(0, this.limit() || this.slicer()?.members?.length)
        .filter(nonNullable) ?? []
  )
  public readonly more = computed(() => (this.limit ? this.slicer()?.members?.length - this.limit() : 0))

  public readonly displayBehaviour$ = toObservable(this.slicer).pipe(
    map((slicer) => slicer?.dimension?.displayBehaviour)
  )

  public readonly advancedSlicer$ = toObservable(this.slicer).pipe(
    combineLatestWith(this.translate.stream('Ngm.Selection')),
    map(([slicer, SELECTION]) => {
      if (isAdvancedSlicer(slicer)) {
        return advancedSlicerAsString(slicer, SELECTION?.OnContext)
      } else if (isAdvancedFilter(slicer)) {
        return slicerAsString(slicer)
      } else if (isTimeRangesSlicer(slicer)) {
        return timeRangesSlicerAsString(slicer, SELECTION?.TimeRanges)
      }

      return null
    })
  )

  remove() {
    this.removed.emit()
  }

  removeMember(index: number) {
    const value = {
      ...this.slicer(),
      members: [...this.slicer().members]
    }
    value.members.splice(index, 1)

    this.slicerChange.emit(value)
  }

  async editSlicer() {
    let slicer = await this.openSlicerEditor(this.slicer())
    if (slicer) {
      slicer = {
        ...this.slicer(),
        ...slicer,
        // Update dimension
        dimension: {
          ...this.slicer().dimension,
          ...slicer.dimension
        }
      }
      this.slicerChange.emit(slicer)
    }
  }
}
