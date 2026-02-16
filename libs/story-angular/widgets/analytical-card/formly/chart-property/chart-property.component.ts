import { Component, DestroyRef, OnInit, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormArray, FormControl } from '@angular/forms'
import { NgmFormlyArrayComponent } from '@metad/formly/array'
import { PropertyCapacity } from '@metad/ocap-angular/entity'
import { ChartType, DataSettings, EntitySet, EntityType } from '@metad/ocap-core'
import { FieldType, FormlyFieldConfig, FormlyFieldProps } from '@ngx-formly/core'
import { BehaviorSubject, Observable, map } from 'rxjs'

@Component({
  standalone: false,
  selector: 'ngm-formly-chart-property',
  templateUrl: './chart-property.component.html',
  styleUrls: ['./chart-property.component.scss']
})
export class NgmFormlyChartPropertyComponent
  extends FieldType<
    {
      capacities: PropertyCapacity[]
      chartType$: Observable<ChartType>
    } & FormlyFieldConfig<FormlyFieldProps & { [additionalProperties: string]: any }>
  >
  implements OnInit
{
  private readonly destroyRef = inject(DestroyRef)
  private readonly parentArray? = inject(NgmFormlyArrayComponent, { optional: true })

  get formControl() {
    return super.formControl as FormControl
  }
  get capacities() {
    return this.props.capacities
  }
  get chartType$() {
    return this.props.chartType$
  }
  get removeable() {
    return this.props?.removeable ?? true
  }
  public readonly dataSettings$ = new BehaviorSubject<DataSettings>(null)
  public readonly entitySet$ = new BehaviorSubject<EntitySet>(null)
  public readonly entityType$ = new BehaviorSubject<EntityType>(null)
  public readonly syntax$ = this.entityType$.pipe(map((entityType) => entityType?.syntax))
  public readonly restrictedDimensions$ = new BehaviorSubject<string[]>(null)

  ngOnInit(): void {
    // 初始化完成后再发送数据
    if (this.field?.props?.entityType instanceof Observable) {
      this.field.props.entityType
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => this.entityType$.next(event))
    } else if (this.field.props.entityType) {
      this.entityType$.next(this.field.props.entityType)
      // 注意: 这样的 of(event) 异步事件会紧跟着一个 complete 事件导致 this.entityType$ 被 Complete
      // of(this.field.props.entityType).subscribe(this.entityType$)
    }

    if (this.field?.props?.dataSettings instanceof Observable) {
      this.field.props.dataSettings
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => this.dataSettings$.next(event))
    } else if (this.field?.props?.dataSettings) {
      this.dataSettings$.next(this.field.props.dataSettings)
    }

    if (this.field?.props?.restrictedDimensions instanceof Observable) {
      this.field.props.restrictedDimensions
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((event) => this.restrictedDimensions$.next(event))
    } else if (this.field?.props?.restrictedDimensions) {
      this.restrictedDimensions$.next(this.field.props.restrictedDimensions)
    }
  }

  /**
   * Remove myself from parent array or clear my value
   */
  killMyself() {
    if (this.field.form instanceof FormArray) {
      const index = this.field.parent.fieldGroup.indexOf(this.field)
      this.parentArray?.remove(index)
    } else {
      const index = this.field.parent.fieldGroup.findIndex((field) => field.key === this.field.key)
      if (index > -1) {
        this.field.parent.fieldGroup.splice(index, 1)
        this.field.parent.model[this.field.key as string] = null
      }

      /**
       * @todo 存在问题，有属性没有值的情况下会报错
       */
      this.field.parent.formControl.setValue(this.field.parent.model)
    }
  }

  /**
   * @todo 未完成效果
   */
  clear() {
    this.formControl.setValue(null)
    this.field.parent.model[this.field.key as string] = null
  }
}
