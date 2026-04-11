import { Component, forwardRef, Input } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormArray, FormControl, FormGroup, NG_VALUE_ACCESSOR } from '@angular/forms'
import { AggregationRole, Dimension, EntitySet, getEntityDimensionAndHierarchies, ISlicer } from '@xpert-ai/ocap-core'
import { isEqual } from 'lodash-es'
import { BehaviorSubject, distinctUntilChanged, map, shareReplay, withLatestFrom } from 'rxjs'
import { NgmFieldAppearance } from "@xpert-ai/ocap-angular/core";

@Component({
  selector: 'ngm-slicer-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  standalone: false,
  host: {
    class: 'ngm-slicer-select'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => SlicerSelectComponent)
    }
  ]
})
export class SlicerSelectComponent implements ControlValueAccessor {
  AggregationRole = AggregationRole
  @Input() appearance: NgmFieldAppearance = 'fill'
  @Input() slicer: ISlicer
  @Input() get entitySet(): EntitySet {
    return this.entitySet$.value
  }
  set entitySet(value) {
    this.entitySet$.next(value)
  }
  private entitySet$ = new BehaviorSubject<EntitySet>(null)

  public dimensions$ = this.entitySet$.pipe(
    map((entitySet) => getEntityDimensionAndHierarchies(entitySet?.entityType)),
    shareReplay(1)
  )

  formGroup = new FormGroup({
    dimension: new FormGroup({
      dimension: new FormControl(),
      hierarchy: new FormControl(),
      level: new FormControl()
    }),
    members: new FormArray([])
  })
  formControl = new FormControl()
  private onChange: (value: any) => any

  constructor() {
    this.formControl.valueChanges
      .pipe(
        withLatestFrom(this.dimensions$),
        map(([id, dimensions]) => {
          const property = dimensions.find((item) => item.__id__ === id)
          if (property.role === AggregationRole.dimension) {
            return { dimension: property.name }
          } else if (property.role === AggregationRole.hierarchy) {
            return {
              dimension: property.dimension,
              hierarchy: property.name
            }
          }
          return null
        }),
        takeUntilDestroyed()
      )
      .subscribe((dimension: Dimension) => {
        this.formGroup.patchValue({ dimension })
      })
    this.formGroup.valueChanges.pipe(distinctUntilChanged(isEqual), takeUntilDestroyed()).subscribe((value) => {
      this.onChange?.(value)
    })
  }

  writeValue(obj: any): void {
    const value = obj || {}
    // 避免双向绑定的循环更新
    if (!isEqual(value, this.formGroup.value)) {
      this.formGroup.patchValue(value)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    //
  }
  setDisabledState?(isDisabled: boolean): void {
    //
  }
}
