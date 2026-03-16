
import { Component, Input, forwardRef, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormGroup, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { ChartType, cloneDeep } from '@metad/ocap-core'
import { AccordionWrappers } from '@metad/story/designer'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { map } from 'rxjs/operators'
import { chartSettingsFieldGroup } from '../analytical-card.schema'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, FormlyModule],
  selector: 'ngm-chart-settings',
  templateUrl: 'chart-settings.component.html',
  styleUrls: ['chart-settings.component.scss'],
  host: {
    class: 'ngm-chart-settings'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmChartSettingsComponent)
    }
  ]
})
export class NgmChartSettingsComponent implements ControlValueAccessor {
  private readonly translateService = inject(TranslateService)

  @Input()
  get chartType() {
    return this.chartType$.value
  }
  set chartType(value) {
    this.chartType$.next(value)
  }
  private chartType$ = new BehaviorSubject<ChartType>(null)

  formGroup = new FormGroup({})

  fields = toSignal(
    this.translateService.stream('Story').pipe(
      map((i18nStory) => {
        return [
          ...AccordionWrappers([
            {
              key: 'chartSettings',
              label: i18nStory?.Widgets?.CHART?.ChartSettings ?? 'Chart Settings',
              toggleable: false,
              fieldGroup: chartSettingsFieldGroup(i18nStory?.Widgets)
            }
          ])

          // getChartOptionsSchema(chartType, i18nStory?.STYLING?.ECHARTS)
        ]
      })
    )
  )

  model = {}
  options = {}

  onChange: (input: any) => void
  onTouched: () => void

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.patchValue(obj)
      this.model = cloneDeep(obj)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formGroup.disable() : this.formGroup.enable()
  }
  onModelChange(event) {
    this.onChange(event)
  }
}
