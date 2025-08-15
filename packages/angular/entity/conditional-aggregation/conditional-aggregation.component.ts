import { CommonModule } from '@angular/common'
import { Component, computed, forwardRef, inject, input, OnInit } from '@angular/core'
import {
  ControlValueAccessor,
  FormBuilder,
  FormGroup,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { NgmParameterSelectComponent } from '@metad/ocap-angular/parameter'
import {
  AggregationCompareOperations,
  AggregationOperation,
  AggregationOperations,
  DataSettings,
  DisplayBehaviour,
  EntityType,
  getEntityMeasures,
  isIndicatorMeasureProperty,
  isNil,
  negate,
  Property,
  PropertyMeasure
} from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { sortBy } from 'lodash-es'
import { PropertyCapacity } from '../types'
import { NgmMeasureSelectComponent } from '../measure-select/measure-select.component'
import { NgmPropertyArrayComponent } from '../property-array/property-array.component'


@Component({
  standalone: true,
  selector: 'ngm-conditional-aggregation',
  templateUrl: './conditional-aggregation.component.html',
  styleUrls: ['./conditional-aggregation.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmConditionalAggregationComponent)
    }
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    TranslateModule,
    NgmCommonModule,
    NgmParameterSelectComponent,
    NgmMeasureSelectComponent,
    NgmPropertyArrayComponent
  ]
})
export class NgmConditionalAggregationComponent implements ControlValueAccessor, OnInit {
  DISPLAY_BEHAVIOUR = DisplayBehaviour
  eAggregationOperation = AggregationOperation
  PropertyCapacity = PropertyCapacity

  private formBuilder = inject(FormBuilder)
  readonly #translate = inject(TranslateService)

  OPERATIONS = AggregationOperations.map((operation) => ({...operation, label: this.#translate.instant(`Ngm.Calculation.${operation.label.split(' ').join('')}`, {Default: operation.label}) }))
  COMPARES = [{value: null, label: ''}, ...AggregationCompareOperations.map((operation) => ({...operation, label: this.#translate.instant(`Ngm.Calculation.${operation.label.split(' ').join('')}`, {Default: operation.label}) }))]
  HAS_VALUE_OPERATIONS = [AggregationOperation.TOP_COUNT, AggregationOperation.TOP_PERCENT, AggregationOperation.TOP_SUM]
  COMPARE_VALUE_OPERATIONS = [AggregationOperation.SUM, AggregationOperation.COUNT]
  COMPARE_NO_VALUE = [null, 'empty', 'not_empty']

  // Inputs
  readonly dataSettings = input<DataSettings>(null)
  readonly entityType = input<EntityType>(null)
  readonly dsCoreService = input<NgmDSCoreService>(null)

  // States
  measures: Array<Property>
  useConditional = false

  // Forms
  formGroup: FormGroup

  get operation() {
    return this.formGroup?.value?.operation
  }

  filterMeasure: (measure: PropertyMeasure) => boolean = (measure) => isNil(this.formGroup?.value?.name) ? true :
    measure.name !== this.formGroup.value.name
  
  private _onChange: any
  private _onTouched: any

  // The list of metrics after excluding indicator metrics
  public readonly measures$ = computed(() => {
    return sortBy(
      getEntityMeasures(this.entityType()).filter((property) => negate(isIndicatorMeasureProperty)(property)),
      'calculationType'
    ).reverse()
  })

  ngOnInit(): void {
    this.measures = getEntityMeasures(this.entityType())

    this.formGroup = this.formBuilder.group({
      name: null,
      operation: this.formBuilder.control(null, [Validators.required]),
      compare: null,
      value: null,
      measure: this.formBuilder.control(null, [Validators.required]),
      aggregationDimensions: null, //this.formBuilder.array([ ]),
      useConditionalAggregation: null,
      conditionalDimensions: null,
      excludeConditions: null
    })
    this.formGroup.valueChanges.subscribe((value) => {
      this._onChange?.(value)
    })
  }

  writeValue(obj: any): void {
    this.formGroup.patchValue(obj || {})
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    if (isDisabled) {
      this.formGroup.disable()
    } else {
      this.formGroup.enable()
    }
  }
}
