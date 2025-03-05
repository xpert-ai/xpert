import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Output, booleanAttribute, computed, inject, input } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { injectTranslate } from '@metad/ocap-angular/core'
import {
  EntityType,
  FilterSelectionType,
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
import { combineLatestWith, map } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
  ],
  selector: 'ngm-slicer-label',
  templateUrl: 'slicer.component.html',
  styleUrls: ['slicer.component.scss']
})
export class SlicerLabelComponent {
  private translate = inject(TranslateService)
  readonly i18n = injectTranslate('Ngm.Selection')

  readonly slicer = input<ISlicer>()
  readonly entityType = input<EntityType>()
  readonly disabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly limit = input<number>()

  @Output() removed = new EventEmitter()
  @Output() slicerChange = new EventEmitter<ISlicer>()

  // States
  readonly title = computed(() => {
    const slicer = this.slicer()
    const entityType = this.entityType()

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
  readonly selectionType = computed(() => this.slicer()?.selectionType)
  readonly isSingleRange = computed(() => this.selectionType() === FilterSelectionType.SingleRange)

  readonly advancedSlicer = computed(() => {
    const SELECTION = this.i18n()
    const slicer = this.slicer()

    if (isAdvancedSlicer(slicer)) {
      return advancedSlicerAsString(slicer, SELECTION?.OnContext)
    } else if (isAdvancedFilter(slicer)) {
      return slicerAsString(slicer)
    } else if (isTimeRangesSlicer(slicer)) {
      return timeRangesSlicerAsString(slicer, SELECTION?.TimeRanges)
    }

    const members = slicer.members ?? []
    if (this.isSingleRange() && members.length) {
      return `${(members[0]?.caption || members[0]?.key) || '?'} : ${(members[1]?.caption || members[1]?.key) || '?'}`
    }

    return null
  })

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
}
