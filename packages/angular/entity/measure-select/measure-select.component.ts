import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, forwardRef, inject, input, ViewContainerRef } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSelectModule } from '@metad/ocap-angular/common'
import { NgmDSCoreService, NgmOcapCoreService } from '@metad/ocap-angular/core'
import {
  DataSettings,
  getEntityMeasures,
  getEntityProperty,
  isCalculationProperty,
  isEntitySet,
  isIndicatorMeasureProperty,
  nonNullable,
  PropertyMeasure
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { orderBy } from 'lodash-es'
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs'
import { NgmEntityPropertyComponent } from '../property/property.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgmSelectModule,
    NgmEntityPropertyComponent
  ],
  selector: 'ngm-measure-select',
  templateUrl: './measure-select.component.html',
  styles: [],
  inputs: ['color', 'disabled'],
  host: {
    class: 'ngm-measure-select'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMeasureSelectComponent)
    }
  ]
})
export class NgmMeasureSelectComponent implements ControlValueAccessor {
  private readonly dsCoreService = inject(NgmDSCoreService)
  private readonly coreService = inject(NgmOcapCoreService)
  private readonly _dialog = inject(MatDialog)
  private readonly _viewContainerRef = inject(ViewContainerRef)

  // Inputs
  readonly label = input<string>(null)
  readonly placeholder = input<string>(null)
  readonly dataSettings = input<DataSettings>(null)
  readonly filter = input<(param: PropertyMeasure) => boolean>(null)
  readonly error = input<string>(null)
  readonly calculationable = input<boolean, string | boolean>(false, { transform: booleanAttribute })

  // Forms
  formControl = new FormControl<string>(null)

  // Signals
  private readonly value = toSignal(this.formControl.valueChanges)
  private readonly entityType = toSignal(
    toObservable(this.dataSettings).pipe(
      filter(nonNullable),
      switchMap(({ dataSource, entitySet }) => this.dsCoreService.selectEntitySet(dataSource, entitySet)),
      filter(isEntitySet),
      map(({ entityType }) => entityType)
    )
  )

  public readonly measureOptions = computed(() => {
    const measures = this.entityType() ? getEntityMeasures(this.entityType()) : []
    const filter = this.filter() ?? (() => true)

    return [
      {
        name: null,
        caption: ''
      },
      ...orderBy(
        measures.filter((measure) => !isCalculationProperty(measure)),
        ['name']
      ),
      ...orderBy(
        measures.filter((measure) => isCalculationProperty(measure) && !isIndicatorMeasureProperty(measure)),
        ['calculationType', 'name']
      ),
      ...orderBy(
        measures.filter((measure) => isIndicatorMeasureProperty(measure)),
        ['name']
      )
    ]
      .filter(filter)
      .map((measure) => ({
        key: measure.name,
        caption: measure.caption,
        value: measure
      }))
  })
  private readonly syntax = computed(() => this.entityType()?.syntax)

  private readonly property = computed(() => {
    return getEntityProperty(this.entityType(), this.value())
  })
  public readonly isCalculationProperty = computed(() => {
    return isCalculationProperty(this.property()) && !isIndicatorMeasureProperty(this.property())
  })

  onChange: (input: any) => void
  onTouched: () => void
  // Subscribers
  private _formValueSub = this.formControl.valueChanges.pipe(distinctUntilChanged()).subscribe((value) => {
    this.onChange?.(value)
  })

  writeValue(obj: any): void {
    this.formControl.setValue(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formControl.disable() : this.formControl.enable()
  }

  async openCalculationMeasure() {
    const data = {
      dataSettings: this.dataSettings(),
      entityType: this.entityType(),
      syntax: this.syntax(),
      // coreService: this.coreService,
      dsCoreService: this.dsCoreService,
      value: null
    }

    this.coreService.openCalculation(data).subscribe((property) => {
      if (property) {
        // 发送给 DSCoreService 存储到元信息增强里
        // this.coreService.storyUpdateEvent$.next({
        //   type: 'Calculation',
        //   dataSettings: this.dataSettings(),
        //   property
        // })
        this.coreService.updateEntity({
          type: 'Calculation',
          dataSettings: this.dataSettings(),
          property
        })
        // 然后将新计算度量名称赋值给当前控件
        this.formControl.setValue(property.name)
      }
    })

    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<NgmCalculationEditorComponent, unknown, CalculationProperty>(NgmCalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data
    //     })
    //     .afterClosed()
    // )
  }

  async editCalculationMeasure() {
    const data = {
      dataSettings: this.dataSettings(),
      entityType: this.entityType(),
      syntax: this.syntax(),
      // coreService: this.coreService,
      dsCoreService: this.dsCoreService,
      value: this.property()
    }

    this.coreService.openCalculation(data).subscribe((property) => {
      if (property) {
        // 发送给 DSCoreService 存储到元信息增强里
        // this.coreService.storyUpdateEvent$.next({
        //   type: 'Calculation',
        //   dataSettings: this.dataSettings(),
        //   property
        // })
        this.coreService.updateEntity({
          type: 'Calculation',
          dataSettings: this.dataSettings(),
          property
        })
        // 然后将新计算度量名称赋值给当前控件
        this.formControl.setValue(property.name)
      }
    })

    // const property = await firstValueFrom(
    //   this._dialog
    //     .open<NgmCalculationEditorComponent, unknown, CalculationProperty>(NgmCalculationEditorComponent, {
    //       viewContainerRef: this._viewContainerRef,
    //       data
    //     })
    //     .afterClosed()
    // )
  }
}
